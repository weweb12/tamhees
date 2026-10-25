/** Tamhees — Evidence record storage and retrieval. */

import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { atomicWriteJson, readControlledFiles, verifyPathSafety, verifyStorageTreeSafety } from './atomic-write.js';
import { STORAGE_DIR } from './identity.js';
import { scanEvidenceRecord } from './privacy.js';
import type { EvidenceRecord, ValidationIssue } from './types.js';
import { validateEvidenceRecord } from './validation.js';
import { loadAllRecords } from './store.js';
import { withWriteLock } from './lock.js';

export interface EvidenceWriteResult {
  readonly success: boolean;
  readonly record: EvidenceRecord | null;
  readonly errors: readonly ValidationIssue[];
}

export async function storeEvidenceRecord(
  projectDir: string,
  candidate: unknown,
): Promise<EvidenceWriteResult> {
  return withWriteLock(projectDir, () => storeEvidenceRecordUnlocked(projectDir, candidate));
}

async function storeEvidenceRecordUnlocked(
  projectDir: string,
  candidate: unknown,
): Promise<EvidenceWriteResult> {
  const validation = validateEvidenceRecord(candidate);
  if (!validation.valid) {
    return { success: false, record: null, errors: validation.issues };
  }
  const record = candidate as EvidenceRecord;
  const scan = scanEvidenceRecord(record);
  if (scan.secretLike) {
    return {
      success: false,
      record: null,
      errors: [{
        field: 'content',
        code: 'SECRET_LIKE_CONTENT',
        message: `Evidence was not stored because secret-like content matched: ${scan.patternIds.join(', ')}. Redact it before retrying.`,
      }],
    };
  }

  const absProjectDir = resolve(projectDir);
  const storagePath = join(absProjectDir, STORAGE_DIR);
  const treeSafety = await verifyStorageTreeSafety(storagePath, absProjectDir);
  if (!treeSafety.safe) {
    return pathError(treeSafety.reason ?? 'Storage tree is unsafe.');
  }

  const { records, errors: recordErrors } = await loadAllRecords(absProjectDir);
  if (recordErrors.length > 0) {
    return {
      success: false,
      record: null,
      errors: recordErrors.map((message) => ({ field: 'memoryIds', code: 'STORE_INVALID', message })),
    };
  }
  const knownIds = new Set(records.map((item) => item.id));
  const unknownIds = record.memoryIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    return {
      success: false,
      record: null,
      errors: [{ field: 'memoryIds', code: 'UNKNOWN_MEMORY', message: `Evidence references unknown memory IDs: ${unknownIds.join(', ')}.` }],
    };
  }

  const evidenceDir = join(storagePath, 'evidence');
  await mkdir(evidenceDir, { recursive: true });
  const filePath = join(evidenceDir, `${record.id}.json`);
  const safety = await verifyPathSafety(filePath, absProjectDir);
  if (!safety.safe) {
    return pathError(safety.reason ?? 'Evidence path is unsafe.');
  }

  try {
    await stat(filePath);
    return {
      success: false,
      record: null,
      errors: [{ field: 'id', code: 'DUPLICATE_ID', message: `Evidence ID ${record.id} already exists and was preserved.` }],
    };
  } catch (err: unknown) {
    if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
      return pathError('Unable to check the evidence destination.');
    }
  }

  try {
    await atomicWriteJson(filePath, record, { allowOverwrite: false });
    return { success: true, record, errors: [] };
  } catch (err: unknown) {
    return {
      success: false,
      record: null,
      errors: [{ field: '', code: 'WRITE_FAILED', message: err instanceof Error ? err.message : String(err) }],
    };
  }
}

export async function loadAllEvidence(
  projectDir: string,
): Promise<{ evidence: EvidenceRecord[]; errors: string[] }> {
  const absProjectDir = resolve(projectDir);
  const storagePath = join(absProjectDir, STORAGE_DIR);
  const evidenceDir = join(storagePath, 'evidence');
  const evidence: EvidenceRecord[] = [];
  const errors: string[] = [];

  const treeSafety = await verifyStorageTreeSafety(storagePath, absProjectDir);
  if (!treeSafety.safe) {
    return { evidence, errors: [`Path safety check failed: ${treeSafety.reason}`] };
  }

  let files: string[];
  try {
    files = await readdir(evidenceDir);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { evidence, errors };
    }
    return { evidence, errors: ['Cannot read the evidence directory.'] };
  }

  const reads = await readControlledFiles(evidenceDir, files.filter((name) => name.endsWith('.json')).sort());
  for (const read of reads) {
    const file = read.name;
    if (read.unsafeReason !== undefined) {
      errors.push(`Path safety check failed for evidence/${file}: ${read.unsafeReason}`);
      continue;
    }
    try {
      if (read.content === undefined) throw new Error('unreadable');
      const parsed: unknown = JSON.parse(read.content);
      const validation = validateEvidenceRecord(parsed);
      if (!validation.valid) {
        errors.push(`Invalid evidence in ${file}: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ')}. Run "tamhees doctor" for details and a safe fix.`);
        continue;
      }
      evidence.push(parsed as EvidenceRecord);
    } catch {
      errors.push(`Failed to read evidence/${file}. The raw file content was not echoed. Run "tamhees doctor" for details and a safe fix.`);
    }
  }

  return { evidence, errors };
}

function pathError(message: string): EvidenceWriteResult {
  return {
    success: false,
    record: null,
    errors: [{ field: '', code: 'PATH_SAFETY', message }],
  };
}
