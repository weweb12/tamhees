/** Explicit, fail-closed migration from the one supported legacy storage directory. */
import { lstat, readFile, readdir, rename } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { verifyPathSafety } from './atomic-write.js';
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_STORAGE_DIR,
  PRODUCT_NAME,
  STORAGE_DIR,
} from './identity.js';
import { validateBootstrapMigrationMarker } from './migration.js';
import type { MemoryIndex, MemoryRecord } from './types.js';
import {
  isSafeArtifactId,
  validateAuditEvent,
  validateConfig,
  validateEvidenceRecord,
  validateLifecycleMetadata,
  validateMemoryIndex,
  validateMemoryRecord,
  validateState,
} from './validation.js';

const MAX_CONTROLLED_FILE_BYTES = 16 * 1024 * 1024;
const MAX_CONTROLLED_STORE_BYTES = 64 * 1024 * 1024;
const ATOMICITY_NOTE =
  `${PRODUCT_NAME} uses one same-parent directory rename. That operation is atomic only to the extent guaranteed by the local filesystem; post-rename validation is followed by a best-effort rollback on failure.`;

export type LegacyStorageMigrationState =
  | 'NO_MIGRATION_NEEDED'
  | 'ALREADY_CURRENT'
  | 'READY'
  | 'MIGRATED'
  | 'CONFLICT'
  | 'INVALID_LEGACY'
  | 'INVALID_CURRENT'
  | 'PATH_UNSAFE'
  | 'MIGRATION_FAILED'
  | 'RECOVERY_REQUIRED';

export interface LegacyStorageMigrationDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface LegacyStorageMigrationResult {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly success: boolean;
  readonly state: LegacyStorageMigrationState;
  readonly dryRun: boolean;
  readonly changed: boolean;
  readonly from: typeof LEGACY_STORAGE_DIR;
  readonly to: typeof STORAGE_DIR;
  readonly validatedFileCount: number;
  readonly validatedBytes: number;
  readonly atomicity: typeof ATOMICITY_NOTE;
  readonly diagnostics: readonly LegacyStorageMigrationDiagnostic[];
}

export interface LegacyStorageMigrationHooks {
  readonly beforeRename?: () => void | Promise<void>;
  readonly afterRename?: () => void | Promise<void>;
  readonly beforeRollback?: () => void | Promise<void>;
}

interface EntryInspection {
  readonly exists: boolean;
  readonly safe: boolean;
}

interface StorageValidationResult {
  readonly valid: boolean;
  readonly fileCount: number;
  readonly totalBytes: number;
}

interface WalkedFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly size: number;
}

interface WalkResult {
  readonly valid: boolean;
  readonly files: readonly WalkedFile[];
  readonly directories: ReadonlySet<string>;
  readonly totalBytes: number;
}

/**
 * Migrate only .gptbrain/ to .tamhees/ in the supplied verified project root.
 * No caller-controlled source or destination path is accepted.
 */
export async function migrateLegacyStorage(
  projectDir: string,
  dryRun = false,
  hooks: LegacyStorageMigrationHooks = {},
): Promise<LegacyStorageMigrationResult> {
  const root = resolve(projectDir);
  const rootInspection = await inspectProjectRoot(root);
  if (!rootInspection) return failure('PATH_UNSAFE', dryRun, 'PATH_SAFETY', 'The project boundary is not a safe regular directory.');

  const legacyPath = join(root, LEGACY_STORAGE_DIR);
  const currentPath = join(root, STORAGE_DIR);
  const legacy = await inspectStorageEntry(legacyPath, root);
  const current = await inspectStorageEntry(currentPath, root);
  if (!legacy.safe || !current.safe) {
    return failure('PATH_UNSAFE', dryRun, 'PATH_SAFETY', 'A storage path is unsafe or is not a regular directory.');
  }

  if (!legacy.exists && !current.exists) {
    return success('NO_MIGRATION_NEEDED', dryRun, false, 0, 0, 'No legacy or current storage directory exists. Nothing was changed.');
  }
  if (legacy.exists && current.exists) {
    return failure('CONFLICT', dryRun, 'BOTH_DIRECTORIES_EXIST', `Both legacy and current storage exist. ${PRODUCT_NAME} will not merge, overwrite, delete, or choose either directory.`);
  }
  if (current.exists) {
    const validated = await validateControlledStorage(root, STORAGE_DIR);
    if (!validated.valid) return failure('INVALID_CURRENT', dryRun, 'CURRENT_STORE_INVALID', `Current ${PRODUCT_NAME} storage failed controlled-artifact validation and was preserved.`);
    return success('ALREADY_CURRENT', dryRun, false, validated.fileCount, validated.totalBytes, `Canonical ${PRODUCT_NAME} storage is already current. Nothing was changed.`);
  }

  const legacyValidation = await validateControlledStorage(root, LEGACY_STORAGE_DIR);
  if (!legacyValidation.valid) {
    return failure('INVALID_LEGACY', dryRun, 'LEGACY_STORE_INVALID', 'Legacy storage failed controlled-artifact validation and was preserved byte-for-byte.');
  }
  if (dryRun) {
    return success('READY', true, false, legacyValidation.fileCount, legacyValidation.totalBytes, 'Legacy storage is safe and valid. A real run would perform one same-parent directory rename and post-validate the result.');
  }

  let renamed = false;
  try {
    await hooks.beforeRename?.();
    const legacyRecheck = await inspectStorageEntry(legacyPath, root);
    const currentRecheck = await inspectStorageEntry(currentPath, root);
    if (!legacyRecheck.safe || !legacyRecheck.exists || !currentRecheck.safe || currentRecheck.exists) {
      return failure('MIGRATION_FAILED', false, 'STATE_CHANGED', 'Storage state changed during migration validation. Nothing was overwritten.');
    }
    const finalLegacyValidation = await validateControlledStorage(root, LEGACY_STORAGE_DIR);
    if (!finalLegacyValidation.valid) {
      return failure('INVALID_LEGACY', false, 'LEGACY_STORE_INVALID', 'Legacy storage changed or failed validation before migration and was preserved.');
    }

    await rename(legacyPath, currentPath);
    renamed = true;
    await hooks.afterRename?.();
    const migratedValidation = await validateControlledStorage(root, STORAGE_DIR);
    if (!migratedValidation.valid) throw new Error('POST_VALIDATION_FAILED');
    return success('MIGRATED', false, true, migratedValidation.fileCount, migratedValidation.totalBytes, `Legacy storage was renamed to canonical ${PRODUCT_NAME} storage and validated.`);
  } catch {
    if (!renamed) {
      return failure('MIGRATION_FAILED', false, 'RENAME_FAILED', 'The local filesystem did not complete the directory rename. Legacy storage was preserved.');
    }
    const rolledBack = await rollbackRename(root, legacyPath, currentPath, hooks);
    if (!rolledBack) {
      return failure('RECOVERY_REQUIRED', false, 'ROLLBACK_FAILED', 'Post-migration validation failed and automatic rollback could not be proven safe. Inspect the two controlled storage names before retrying.');
    }
    return failure('MIGRATION_FAILED', false, 'POST_VALIDATION_FAILED', 'Post-migration validation failed. The directory rename was rolled back and legacy storage was revalidated.');
  }
}

async function inspectProjectRoot(root: string): Promise<boolean> {
  try {
    const info = await lstat(root);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function inspectStorageEntry(path: string, root: string): Promise<EntryInspection> {
  const safety = await verifyPathSafety(path, root);
  if (!safety.safe) return { exists: false, safe: false };
  try {
    const info = await lstat(path);
    return { exists: true, safe: info.isDirectory() && !info.isSymbolicLink() };
  } catch (error: unknown) {
    if (isMissing(error)) return { exists: false, safe: true };
    return { exists: false, safe: false };
  }
}

async function rollbackRename(
  root: string,
  legacyPath: string,
  currentPath: string,
  hooks: LegacyStorageMigrationHooks,
): Promise<boolean> {
  try {
    const legacy = await inspectStorageEntry(legacyPath, root);
    const current = await inspectStorageEntry(currentPath, root);
    if (!legacy.safe || legacy.exists || !current.safe || !current.exists) return false;
    await hooks.beforeRollback?.();
    await rename(currentPath, legacyPath);
    const validation = await validateControlledStorage(root, LEGACY_STORAGE_DIR);
    const finalLegacy = await inspectStorageEntry(legacyPath, root);
    const finalCurrent = await inspectStorageEntry(currentPath, root);
    return validation.valid && finalLegacy.safe && finalLegacy.exists && finalCurrent.safe && !finalCurrent.exists;
  } catch {
    return false;
  }
}

async function validateControlledStorage(
  root: string,
  directoryName: typeof STORAGE_DIR | typeof LEGACY_STORAGE_DIR,
): Promise<StorageValidationResult> {
  const storagePath = join(root, directoryName);
  const walked = await walkControlledTree(storagePath, root);
  if (!walked.valid) return invalidStorage();

  const requiredDirectories = [
    'memories', 'memories/records', 'evidence', 'audits', 'episodes', 'archive', 'runtime',
  ];
  if (requiredDirectories.some((directory) => !walked.directories.has(directory))) return invalidStorage();

  const files = new Map(walked.files.map((file) => [file.relativePath, file]));
  for (const required of ['config.json', 'state.json', 'memories/index.json', 'audits/history.jsonl']) {
    if (!files.has(required)) return invalidStorage();
  }

  const records = new Map<string, MemoryRecord>();
  for (const file of walked.files) {
    if (!isAllowedControlledFile(file.relativePath)) return invalidStorage();
    if (file.relativePath === 'audits/history.jsonl') {
      if (!await validateAuditHistory(file.absolutePath)) return invalidStorage();
      continue;
    }
    const parsed = await readJsonArtifact(file.absolutePath);
    if (parsed === null) return invalidStorage();

    if (file.relativePath === 'config.json') {
      if (!validateConfig(parsed).valid) return invalidStorage();
    } else if (file.relativePath === 'state.json') {
      if (!validateState(parsed).valid) return invalidStorage();
    } else if (file.relativePath === 'memories/index.json') {
      if (!validateMemoryIndex(parsed).valid) return invalidStorage();
    } else if (file.relativePath.startsWith('memories/records/')) {
      if (!validateMemoryRecord(parsed).valid) return invalidStorage();
      const record = parsed as MemoryRecord;
      if (`${record.id}.json` !== basename(file.relativePath) || records.has(record.id)) return invalidStorage();
      records.set(record.id, record);
    } else if (file.relativePath.startsWith('evidence/')) {
      if (!validateEvidenceRecord(parsed).valid) return invalidStorage();
      if (`${(parsed as { readonly id: string }).id}.json` !== basename(file.relativePath)) return invalidStorage();
    } else if (file.relativePath.startsWith('episodes/')) {
      if (basename(file.relativePath) === 'bootstrap-migration.json') {
        if (!validateBootstrapMigrationMarker(parsed)) return invalidStorage();
      } else {
        if (!validateLifecycleMetadata(parsed).valid) return invalidStorage();
        if (`${(parsed as { readonly lifecycleId: string }).lifecycleId}.json` !== basename(file.relativePath)) return invalidStorage();
      }
    } else if (file.relativePath.startsWith('archive/memories/')) {
      if (!validateMemoryRecord(parsed).valid) return invalidStorage();
      const segments = file.relativePath.split('/');
      if ((parsed as MemoryRecord).id !== segments[2]) return invalidStorage();
    }
  }

  const indexArtifact = files.get('memories/index.json');
  if (indexArtifact === undefined) return invalidStorage();
  const indexValue = await readJsonArtifact(indexArtifact.absolutePath);
  if (indexValue === null || !indexMatchesRecords(indexValue as MemoryIndex, records)) return invalidStorage();

  return {
    valid: true,
    fileCount: walked.files.length,
    totalBytes: walked.totalBytes,
  };
}

async function walkControlledTree(storagePath: string, root: string): Promise<WalkResult> {
  const files: WalkedFile[] = [];
  const directories = new Set<string>();
  let totalBytes = 0;

  async function visit(directory: string): Promise<boolean> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return false;
    }
    entries.sort((left, right) => compareOrdinal(left.name, right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const safety = await verifyPathSafety(path, root);
      if (!safety.safe) return false;
      let info;
      try {
        info = await lstat(path);
      } catch {
        return false;
      }
      if (info.isSymbolicLink()) return false;
      const rel = normalizeRelative(relative(storagePath, path));
      if (info.isDirectory()) {
        if (!isAllowedControlledDirectory(rel)) return false;
        directories.add(rel);
        if (!await visit(path)) return false;
      } else if (info.isFile()) {
        if (info.size > MAX_CONTROLLED_FILE_BYTES) return false;
        totalBytes += info.size;
        if (totalBytes > MAX_CONTROLLED_STORE_BYTES) return false;
        files.push({ absolutePath: path, relativePath: rel, size: info.size });
      } else {
        return false;
      }
    }
    return true;
  }

  const valid = await visit(storagePath);
  return { valid, files, directories, totalBytes };
}

function isAllowedControlledDirectory(path: string): boolean {
  if (['memories', 'memories/records', 'evidence', 'audits', 'episodes', 'archive', 'runtime', 'archive/memories'].includes(path)) return true;
  const segments = path.split('/');
  return segments.length === 3
    && segments[0] === 'archive'
    && segments[1] === 'memories'
    && isSafeArtifactId(segments[2]);
}

function isAllowedControlledFile(path: string): boolean {
  if (['config.json', 'state.json', 'memories/index.json', 'audits/history.jsonl'].includes(path)) return true;
  const segments = path.split('/');
  if (segments.length === 3 && segments[0] === 'memories' && segments[1] === 'records') {
    return isSafeJsonFilename(segments[2]);
  }
  if (segments.length === 2 && segments[0] === 'evidence') return isSafeJsonFilename(segments[1]);
  if (segments.length === 2 && segments[0] === 'episodes') return isSafeJsonFilename(segments[1]);
  if (segments.length === 4 && segments[0] === 'archive' && segments[1] === 'memories') {
    return isSafeArtifactId(segments[2]) && extname(segments[3] ?? '') === '.json';
  }
  return false;
}

function isSafeJsonFilename(value: string | undefined): boolean {
  if (value === undefined || extname(value) !== '.json') return false;
  return isSafeArtifactId(value.slice(0, -'.json'.length));
}

async function validateAuditHistory(path: string): Promise<boolean> {
  let text: string;
  try {
    text = decodeUtf8(await readFile(path));
  } catch {
    return false;
  }
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    try {
      if (!validateAuditEvent(JSON.parse(line) as unknown).valid) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function readJsonArtifact(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(decodeUtf8(await readFile(path))) as unknown;
  } catch {
    return null;
  }
}

function decodeUtf8(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function indexMatchesRecords(index: MemoryIndex, records: ReadonlyMap<string, MemoryRecord>): boolean {
  if (index.entries.length !== records.size) return false;
  const entries = [...index.entries].sort((left, right) => compareOrdinal(left.id, right.id));
  const expected = [...records.values()].sort((left, right) => compareOrdinal(left.id, right.id));
  return entries.every((entry, indexValue) => {
    const record = expected[indexValue];
    return record !== undefined
      && entry.id === record.id
      && entry.kind === record.kind
      && entry.verificationStatus === record.verificationStatus
      && entry.updatedAt === record.updatedAt
      && arraysEqual(entry.tags, record.tags);
  });
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeRelative(value: string): string {
  return sep === '/' ? value : value.split(sep).join('/');
}

function success(
  state: Extract<LegacyStorageMigrationState, 'NO_MIGRATION_NEEDED' | 'ALREADY_CURRENT' | 'READY' | 'MIGRATED'>,
  dryRun: boolean,
  changed: boolean,
  fileCount: number,
  totalBytes: number,
  message: string,
): LegacyStorageMigrationResult {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    success: true,
    state,
    dryRun,
    changed,
    from: LEGACY_STORAGE_DIR,
    to: STORAGE_DIR,
    validatedFileCount: fileCount,
    validatedBytes: totalBytes,
    atomicity: ATOMICITY_NOTE,
    diagnostics: [{ code: state, message }],
  };
}

function failure(
  state: Exclude<LegacyStorageMigrationState, 'NO_MIGRATION_NEEDED' | 'ALREADY_CURRENT' | 'READY' | 'MIGRATED'>,
  dryRun: boolean,
  code: string,
  message: string,
): LegacyStorageMigrationResult {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    success: false,
    state,
    dryRun,
    changed: false,
    from: LEGACY_STORAGE_DIR,
    to: STORAGE_DIR,
    validatedFileCount: 0,
    validatedBytes: 0,
    atomicity: ATOMICITY_NOTE,
    diagnostics: [{ code, message }],
  };
}

function invalidStorage(): StorageValidationResult {
  return { valid: false, fileCount: 0, totalBytes: 0 };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}