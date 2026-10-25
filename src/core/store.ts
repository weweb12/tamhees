import { normalizeLegacyMemory } from './scope.js';
/**
 * Tamhees — Memory Store
 *
 * Implements .tamhees/ initialization, memory record I/O,
 * and memory index management.
 *
 * All file operations use atomic writes.
 * The index is derived from canonical records and is not
 * an independent source of truth.
 */

import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import {
  CURRENT_SCHEMA_VERSION,
  type Clock,
  type TamheesConfig,
  type TamheesState,
  type MemoryIndex,
  type MemoryIndexEntry,
  type MemoryRecord,
  type ValidationResult,
} from './types.js';
import { STORAGE_DIR, PRODUCT_NAME, CLI_NAME } from './identity.js';
import { validateMemoryRecord, validateConfig, validateState, validateMemoryIndex } from './validation.js';
import { atomicWriteJson, readControlledFiles, verifyStorageTreeSafety, verifyPathSafety } from './atomic-write.js';
import { withWriteLock } from './lock.js';

// ─── Directory structure ────────────────────────────────────

const SUBDIRS = [
  'memories',
  'memories/records',
  'evidence',
  'audits',
  'episodes',
  'archive',
  'runtime',
] as const;

const CONFIG_FILE = 'config.json';
const STATE_FILE = 'state.json';
const INDEX_FILE = 'memories/index.json';
const HISTORY_FILE = 'audits/history.jsonl';

// ─── Init result ────────────────────────────────────────────

export interface InitResult {
  readonly success: boolean;
  readonly created: readonly string[];
  readonly existing: readonly string[];
  readonly errors: readonly string[];
  readonly bootstrapMemoryId: string | null;
}

// ─── Init ───────────────────────────────────────────────────

/**
 * Initialize .tamhees/ directory structure in a project.
 *
 * - Creates all required directories and files.
 * - Is idempotent: running again does not destroy existing data.
 * - Never overwrites valid existing controlled data.
 * - Stops with an error if existing controlled data is malformed.
 * - Refuses if any path in the storage tree is a symbolic link.
 * - Creates one bootstrap memory (non-authoritative observation).
 * - Validates ALL existing records before rebuilding the index.
 * - Derives projectName from directory basename.
 */
export async function initTamhees(
  projectDir: string,
  clock: Clock,
): Promise<InitResult> {
  // Directories are created idempotently first so the lock file has a home; the
  // file-creating part of init then runs under the write lock.
  const absProject = resolve(projectDir);
  const preSafety = await verifyStorageTreeSafety(join(absProject, STORAGE_DIR), absProject);
  if (preSafety.safe) {
    try {
      await mkdir(join(absProject, STORAGE_DIR, 'runtime'), { recursive: true });
    } catch {
      // Reported by the unlocked initializer below.
    }
  }
  return withWriteLock(projectDir, () => initTamheesUnlocked(projectDir, clock));
}

async function initTamheesUnlocked(
  projectDir: string,
  clock: Clock,
): Promise<InitResult> {
  const absProjectDir = resolve(projectDir);
  const tamheesPath = join(absProjectDir, STORAGE_DIR);

  // Deep safety check: verify all controlled paths for symlinks
  const safety = await verifyStorageTreeSafety(tamheesPath, absProjectDir);
  if (!safety.safe) {
    return {
      success: false,
      created: [],
      existing: [],
      errors: [safety.reason ?? 'Path safety check failed.'],
      bootstrapMemoryId: null,
    };
  }

  const created: string[] = [];
  const existing: string[] = [];
  const errors: string[] = [];

  // Create directories
  for (const subdir of [STORAGE_DIR, ...SUBDIRS.map((s) => join(STORAGE_DIR, s))]) {
    const dirPath = join(absProjectDir, subdir);
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (err: unknown) {
      errors.push(`Failed to create directory ${subdir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, created, existing, errors, bootstrapMemoryId: null };
  }

  const now = clock();
  const projectName = basename(absProjectDir);

  // config.json — use proper validator
  const configPath = join(tamheesPath, CONFIG_FILE);
  const configResult = await writeControlledFile<TamheesConfig>(
    configPath,
    absProjectDir,
    {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      projectName,
      createdAt: now,
    },
    validateConfig,
    CONFIG_FILE
  );
  trackResult(configResult, CONFIG_FILE, created, existing, errors);

  // state.json — use proper validator
  const statePath = join(tamheesPath, STATE_FILE);
  const stateResult = await writeControlledFile<TamheesState>(
    statePath,
    absProjectDir,
    {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      lastOperation: 'init',
      lastOperationAt: now,
    },
    validateState,
    STATE_FILE
  );
  trackResult(stateResult, STATE_FILE, created, existing, errors);

  // history.jsonl — validate existing lines if present
  const historyPath = join(tamheesPath, HISTORY_FILE);
  const historyResult = await ensureValidHistoryFile(historyPath, absProjectDir);
  trackResult(historyResult, HISTORY_FILE, created, existing, errors);

  if (errors.length > 0) {
    return { success: false, created, existing, errors, bootstrapMemoryId: null };
  }

  // Bootstrap memory record
  const bootstrapId = 'DM-MEM-000001';
  const bootstrapRecord = createBootstrapRecord(bootstrapId, now);
  const recordPath = join(tamheesPath, 'memories', 'records', `${bootstrapId}.json`);

  const recordResult = await writeControlledFile<MemoryRecord>(
    recordPath,
    absProjectDir,
    bootstrapRecord,
    (value) => validateMemoryRecord(value && typeof value === 'object' ? normalizeLegacyMemory(value) : value),
    `memories/records/${bootstrapId}.json`
  );
  trackResult(recordResult, `memories/records/${bootstrapId}.json`, created, existing, errors);

  // Validate ALL existing records before building index
  const recordsDir = join(tamheesPath, 'memories', 'records');
  const indexBuildResult = await buildValidatedIndex(recordsDir, absProjectDir);

  if (indexBuildResult.errors.length > 0) {
    // Do NOT write a new index after validation failure
    for (const err of indexBuildResult.errors) {
      errors.push(err);
    }
    return {
      success: false,
      created,
      existing,
      errors,
      bootstrapMemoryId: recordResult.status === 'created' ? bootstrapId : null,
    };
  }

  // Memory index — only written after successful validation
  const index: MemoryIndex = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    entries: indexBuildResult.entries,
    lastRebuilt: now,
  };
  const indexPath = join(tamheesPath, INDEX_FILE);
  const indexSafety = await verifyPathSafety(indexPath, absProjectDir);
  if (!indexSafety.safe) {
    errors.push(`Path safety check failed for index.json: ${indexSafety.reason}`);
    return { success: false, created, existing, errors, bootstrapMemoryId: null };
  }
  await atomicWriteJson(indexPath, index, { allowOverwrite: true });
  if (configResult.status === 'created') {
    created.push(INDEX_FILE);
  } else {
    existing.push(INDEX_FILE);
  }

  return {
    success: errors.length === 0,
    created,
    existing,
    errors,
    bootstrapMemoryId: recordResult.status === 'created' ? bootstrapId : null,
  };
}

// ─── Bootstrap record ───────────────────────────────────────

function createBootstrapRecord(id: string, now: string): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    scope: { kind: 'PROJECT' },
    kind: 'OBSERVATION',
    statement: `${PRODUCT_NAME} storage is initialized for this project.`,
    source: {
      type: 'REPOSITORY_STATE',
      reference: `${STORAGE_DIR}/config.json`,
    },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: {
      lastVerified: now,
    },
    sensitivity: 'INTERNAL',
    actionPermission: 'MAY_ACT',
    relationships: {},
    tags: ['project', 'initialization', CLI_NAME],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Record I/O ─────────────────────────────────────────────

/**
 * Load and validate all memory records from .tamhees/memories/records/
 */
export async function loadAllRecords(
  projectDir: string,
): Promise<{ records: MemoryRecord[]; errors: string[] }> {
  const absProjectDir = resolve(projectDir);
  const recordsDir = join(absProjectDir, STORAGE_DIR, 'memories', 'records');
  const records: MemoryRecord[] = [];
  const errors: string[] = [];

  const safety = await verifyStorageTreeSafety(join(absProjectDir, STORAGE_DIR), absProjectDir);
  if (!safety.safe) {
    return { records, errors: [`Path safety check failed: ${safety.reason}`] };
  }

  let files: string[];
  try {
    files = await readdir(recordsDir);
  } catch {
    return { records, errors: [`Cannot read records directory. Run ${CLI_NAME} init first.`] };
  }

  const recordsSafety = await verifyPathSafety(recordsDir, absProjectDir);
  if (!recordsSafety.safe) {
    return { records, errors: [`Path safety check failed: ${recordsSafety.reason}`] };
  }
  const reads = await readControlledFiles(recordsDir, files.filter((f) => f.endsWith('.json')).sort());
  for (const read of reads) {
    const file = read.name;
    if (read.unsafeReason !== undefined) {
      errors.push(`Path safety check failed for ${file}: ${read.unsafeReason}`);
      continue;
    }

    try {
      if (read.content === undefined) throw new Error('unreadable');
      const raw: unknown = JSON.parse(read.content);
      const data: unknown = raw && typeof raw === 'object' && 'statement' in raw ? normalizeLegacyMemory(raw) : raw;
      const validation = validateMemoryRecord(data);
      if (!validation.valid) {
        const issueMessages = validation.issues.map((i) => `  ${i.field}: ${i.message}`).join('\n');
        errors.push(`Invalid record in ${file}:\n${issueMessages}`);
      } else {
        const record = data as MemoryRecord;
        if (file !== `${record.id}.json`) {
          errors.push(`Record filename mismatch: ${file} contains ID ${record.id}. The file was preserved.`);
        } else {
          records.push(record);
        }
      }
    } catch {
      errors.push(`Failed to read ${file}. The raw file content was not echoed.`);
    }
  }

  return { records, errors };
}

/**
 * Load the memory index.
 */
export async function loadIndex(projectDir: string): Promise<MemoryIndex | null> {
  const absProjectDir = resolve(projectDir);
  const indexPath = join(absProjectDir, STORAGE_DIR, INDEX_FILE);

  const safety = await verifyPathSafety(indexPath, absProjectDir);
  if (!safety.safe) {
    return null;
  }

  try {
    const content = await readFile(indexPath, 'utf-8');
    const data: unknown = JSON.parse(content);

    // Validate index
    const validation = validateMemoryIndex(data);
    if (!validation.valid) return null;

    return data as MemoryIndex;
  } catch {
    return null;
  }
}

/** Rebuild the derived memory index after a successful canonical write. */
/**
 * Rebuild index.json. By default every record file is re-read and validated. A caller
 * that holds the write lock and already has the complete, validated record set (a
 * mutation that just loaded the store and wrote one record) may pass `knownRecords`
 * to skip the second full read.
 */
export async function rebuildMemoryIndex(
  projectDir: string,
  clock: Clock,
  knownRecords?: readonly MemoryRecord[],
): Promise<{ success: boolean; index: MemoryIndex | null; errors: readonly string[] }> {
  return withWriteLock(projectDir, () => rebuildMemoryIndexUnlocked(projectDir, clock, knownRecords));
}

async function rebuildMemoryIndexUnlocked(
  projectDir: string,
  clock: Clock,
  knownRecords?: readonly MemoryRecord[],
): Promise<{ success: boolean; index: MemoryIndex | null; errors: readonly string[] }> {
  const absProjectDir = resolve(projectDir);
  const storagePath = join(absProjectDir, STORAGE_DIR);
  const safety = await verifyStorageTreeSafety(storagePath, absProjectDir);
  if (!safety.safe) {
    return { success: false, index: null, errors: [`Path safety check failed: ${safety.reason}`] };
  }

  const recordsDir = join(storagePath, 'memories', 'records');
  const built = knownRecords !== undefined
    ? indexFromRecords(knownRecords)
    : await buildValidatedIndex(recordsDir, absProjectDir);
  if (built.errors.length > 0) {
    return { success: false, index: null, errors: built.errors };
  }

  const index: MemoryIndex = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    entries: built.entries,
    lastRebuilt: clock(),
  };
  const indexPath = join(storagePath, INDEX_FILE);
  const indexSafety = await verifyPathSafety(indexPath, absProjectDir);
  if (!indexSafety.safe) {
    return { success: false, index: null, errors: [`Path safety check failed for index.json: ${indexSafety.reason}`] };
  }
  try {
    await atomicWriteJson(indexPath, index, { allowOverwrite: true });
    return { success: true, index, errors: [] };
  } catch (err: unknown) {
    return { success: false, index: null, errors: [`Failed to rebuild index: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

// ─── Index builder ──────────────────────────────────────────

interface IndexBuildResult {
  entries: MemoryIndexEntry[];
  errors: string[];
}

/**
 * Build a validated index from canonical records.
 * Validates every record. Rejects malformed records and duplicate IDs.
 * Does NOT write anything — returns entries or errors.
 */
function indexFromRecords(records: readonly MemoryRecord[]): IndexBuildResult {
  const entries: MemoryIndexEntry[] = records.map((record) => ({
    id: record.id,
    kind: record.kind,
    tags: [...record.tags],
    verificationStatus: record.verificationStatus,
    updatedAt: record.updatedAt,
  }));
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`Duplicate memory ID detected: ${entry.id}. Cannot build a consistent index.`);
    ids.add(entry.id);
  }
  return { entries, errors };
}

/** Memory IDs present in the store, from file names only (no record is read). */
export async function listMemoryIds(projectDir: string): Promise<string[]> {
  const recordsDir = join(resolve(projectDir), STORAGE_DIR, 'memories', 'records');
  try {
    return (await readdir(recordsDir)).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5));
  } catch {
    return [];
  }
}

async function buildValidatedIndex(recordsDir: string, projectRoot: string): Promise<IndexBuildResult> {
  const entries: MemoryIndexEntry[] = [];
  const errors: string[] = [];

  let files: string[];
  try {
    files = await readdir(recordsDir);
  } catch {
    return { entries, errors };
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();

  const dirSafety = await verifyPathSafety(recordsDir, projectRoot);
  if (!dirSafety.safe) {
    return { entries, errors: [`Path safety check failed during index build: ${dirSafety.reason}`] };
  }
  const reads = await readControlledFiles(recordsDir, jsonFiles);
  for (const read of reads) {
    const file = read.name;
    if (read.unsafeReason !== undefined) {
      errors.push(`Path safety check failed for ${file} during index build: ${read.unsafeReason}`);
      continue;
    }

    try {
      if (read.content === undefined) throw new Error('unreadable');
      const raw: unknown = JSON.parse(read.content);
      const data: unknown = raw && typeof raw === 'object' && 'statement' in raw ? normalizeLegacyMemory(raw) : raw;
      const validation = validateMemoryRecord(data);

      if (!validation.valid) {
        const issueMessages = validation.issues.map((i) => `  ${i.field}: ${i.message}`).join('\n');
        errors.push(`Malformed record in ${file} (preserved for manual review):\n${issueMessages}`);
        continue;
      }

      const record = data as MemoryRecord;
      if (file !== `${record.id}.json`) {
        errors.push(`Record filename mismatch: ${file} contains ID ${record.id}. The file was preserved.`);
        continue;
      }
      entries.push({
        id: record.id,
        kind: record.kind,
        tags: [...record.tags],
        verificationStatus: record.verificationStatus,
        updatedAt: record.updatedAt,
      });
    } catch {
      errors.push(`Cannot parse ${file} as JSON. The raw file content was not echoed.`);
    }
  }

  // Deterministic ordering by ID
  entries.sort((a, b) => a.id.localeCompare(b.id));

  // Duplicate ID detection
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      errors.push(`Duplicate memory ID detected: ${entry.id}. Cannot build a consistent index.`);
    }
    ids.add(entry.id);
  }

  return { entries, errors };
}

// ─── Internal helpers ───────────────────────────────────────

type WriteResult = { status: 'created' | 'existing' } | { status: 'error'; errors: string[] };

async function writeControlledFile<T>(
  filePath: string,
  projectRoot: string,
  data: T,
  validate: (existing: unknown) => import('./types.js').ValidationResult,
  artifactName: string,
): Promise<WriteResult> {
  const safety = await verifyPathSafety(filePath, projectRoot);
  if (!safety.safe) {
    return { status: 'error', errors: [`Path safety check failed for ${artifactName}: ${safety.reason}`] };
  }

  try {
    await stat(filePath);
    // File exists — check validity
    try {
      const content = await readFile(filePath, 'utf-8');
      const existing: unknown = JSON.parse(content);
      const validation = validate(existing);
      if (validation.valid) {
        return { status: 'existing' };
      } else {
        const issues = validation.issues.map(i => `  - Field '${i.field}': ${i.message}`).join('\n');
        return {
          status: 'error',
          errors: [`Malformed existing controlled artifact: ${artifactName}.\n${issues}\nMigration or manual review may be required. The original file was preserved.`]
        };
      }
    } catch {
      return { status: 'error', errors: [`Cannot parse ${artifactName} as JSON. Migration or manual review may be required. The original file was preserved.`] };
    }
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist — create it
      await atomicWriteJson(filePath, data, { allowOverwrite: false });
      return { status: 'created' };
    }
    return { status: 'error', errors: [`Filesystem error checking ${artifactName}`] };
  }
}

async function ensureValidHistoryFile(filePath: string, projectRoot: string): Promise<WriteResult> {
  const safety = await verifyPathSafety(filePath, projectRoot);
  if (!safety.safe) {
    return { status: 'error', errors: [`Path safety check failed for audits/history.jsonl: ${safety.reason}`] };
  }

  try {
    await stat(filePath);
    const { validateAuditEvent } = await import('./validation.js');
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          return { status: 'error', errors: [`Malformed existing audit history in audits/history.jsonl at line ${i + 1}. Validation issue: Not valid JSON.\nMigration or manual review may be required. The file was preserved.`] };
        }

        const validation = validateAuditEvent(parsed);
        if (!validation.valid) {
          const issues = validation.issues.map(issue => `  - Field '${issue.field}': ${issue.message}`).join('\n');
          return { status: 'error', errors: [`Invalid existing audit event in audits/history.jsonl at line ${i + 1}.\n${issues}\nMigration or manual review may be required. The file was preserved.`] };
        }
      }
      return { status: 'existing' };
    } catch (err) {
      return { status: 'error', errors: [`Cannot read audits/history.jsonl. Migration or manual review may be required. The file was preserved.`] };
    }
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(filePath, '', 'utf-8');
      return { status: 'created' };
    }
    return { status: 'error', errors: [`Filesystem error checking audits/history.jsonl`] };
  }
}

function trackResult(
  result: WriteResult,
  label: string,
  created: string[],
  existing: string[],
  errors: string[],
): void {
  if (result.status === 'created') {
    created.push(label);
  } else if (result.status === 'existing') {
    existing.push(label);
  } else if (result.status === 'error') {
    errors.push(...result.errors);
  }
}
