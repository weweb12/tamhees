/**
 * Tamhees — Atomic File Operations
 *
 * Implements safe file writing using temporary-file-plus-rename
 * to prevent data corruption on crash or power failure.
 *
 * All writes go to a temporary file in the same directory as the
 * destination, then rename replaces the target atomically.
 */

import { writeFile, rename, unlink, stat, lstat, readFile, link } from 'node:fs/promises';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ATOMIC_TEMP_PREFIX } from './identity.js';

/**
 * Generate a temporary filename in the same directory as the target.
 * Uses crypto random bytes to avoid collisions.
 */
function tempPath(targetPath: string): string {
  const dir = dirname(targetPath);
  const suffix = randomBytes(8).toString('hex');
  return join(dir, `${ATOMIC_TEMP_PREFIX}${suffix}.tmp`);
}


function refuseOverwrite(absPath: string): Error {
  return new Error(`Refusing to overwrite existing file: ${absPath}. Use allowOverwrite: true to replace.`);
}

/**
 * Move a fully written temp file into place.
 *
 * Overwrite allowed: rename (atomic replacement).
 * Overwrite refused: link() creates the target only if it does not exist (atomic
 * O_EXCL semantics), so two writers can never both "create" the same file. Where hard
 * links are unsupported (some network or FAT volumes) it falls back to check-then-rename.
 */
async function commitTemp(tmp: string, absPath: string, allowOverwrite: boolean): Promise<void> {
  if (allowOverwrite) {
    await rename(tmp, absPath);
    return;
  }
  try {
    await link(tmp, absPath);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') throw refuseOverwrite(absPath);
    if (code !== 'EPERM' && code !== 'ENOTSUP' && code !== 'EOPNOTSUPP' && code !== 'EXDEV' && code !== 'ENOSYS') throw error;
    try {
      await stat(absPath);
      throw refuseOverwrite(absPath);
    } catch (statError: unknown) {
      if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
    }
    await rename(tmp, absPath);
    return;
  }
  await unlink(tmp);
}

/**
 * Write JSON data atomically to the given path.
 *
 * @param targetPath - Absolute path to the destination file.
 * @param data - Object to serialize as JSON.
 * @param options.allowOverwrite - If false, refuses to overwrite an existing file.
 *
 * @throws Error if the target exists and allowOverwrite is false.
 * @throws Error if the write or rename fails.
 */
export async function atomicWriteJson(
  targetPath: string,
  data: unknown,
  options: { allowOverwrite: boolean },
): Promise<void> {
  const absPath = resolve(targetPath);

  if (!options.allowOverwrite) {
    try {
      await stat(absPath);
      throw new Error(
        `Refusing to overwrite existing file: ${absPath}. Use allowOverwrite: true to replace.`,
      );
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        // File does not exist — good, we can proceed.
      } else {
        throw err;
      }
    }
  }

  // Deterministic JSON with sorted keys and 2-space indent
  const json = JSON.stringify(data, sortedReplacer, 2) + '\n';

  const tmp = tempPath(absPath);
  try {
    await writeFile(tmp, json, { encoding: 'utf-8', flush: true });
    await commitTemp(tmp, absPath, options.allowOverwrite);
  } catch (err: unknown) {
    // Best-effort cleanup of temporary file
    try {
      await unlink(tmp);
    } catch {
      // Ignore cleanup failures
    }
    throw err;
  }
}

/** Write UTF-8 text through the same temp-file-plus-rename path. */
export async function atomicWriteText(
  targetPath: string,
  content: string,
  options: { allowOverwrite: boolean },
): Promise<void> {
  const absPath = resolve(targetPath);

  if (!options.allowOverwrite) {
    try {
      await stat(absPath);
      throw new Error(`Refusing to overwrite existing file: ${absPath}.`);
    } catch (err: unknown) {
      if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
        throw err;
      }
    }
  }

  const tmp = tempPath(absPath);
  try {
    await writeFile(tmp, content, { encoding: 'utf-8', flush: true });
    await commitTemp(tmp, absPath, options.allowOverwrite);
  } catch (err: unknown) {
    try {
      await unlink(tmp);
    } catch {
      // Best-effort cleanup only.
    }
    throw err;
  }
}

/**
 * Append a single JSONL line atomically.
 * Uses direct append rather than temp+rename since JSONL is append-only.
 */
export async function appendJsonl(
  targetPath: string,
  data: unknown,
): Promise<void> {
  const absPath = resolve(targetPath);
  const line = JSON.stringify(data, sortedReplacer) + '\n';

  const { appendFile } = await import('node:fs/promises');
  await appendFile(absPath, line, { encoding: 'utf-8', flush: true });
}

/**
 * Append a validated batch as one atomic file replacement.
 *
 * The caller validates both existing rows and new objects before invoking
 * this function. Building the complete replacement before rename prevents a
 * partially appended audit batch if the process fails during the write.
 */
export async function appendJsonlBatch(
  targetPath: string,
  values: readonly unknown[],
): Promise<void> {
  const absPath = resolve(targetPath);
  let existing = '';
  try {
    existing = await readFile(absPath, 'utf-8');
  } catch (err: unknown) {
    if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw err;
    }
  }

  const prefix = existing.length === 0 || existing.endsWith('\n') ? existing : `${existing}\n`;
  const appended = values.map((value) => JSON.stringify(value, sortedReplacer)).join('\n');
  const replacement = appended.length > 0 ? `${prefix}${appended}\n` : prefix;
  await atomicWriteText(absPath, replacement, { allowOverwrite: true });
}

/**
 * Verify a path is not a symbolic link and resolves within the
 * expected project boundary.
 *
 * Uses path.relative for segment-aware containment checking (not startsWith).
 * Walks every existing path component beneath the project root to detect
 * nested symbolic links (e.g. .tamhees/memories pointing outside).
 */
export async function verifyPathSafety(
  targetPath: string,
  projectRoot: string,
): Promise<{ safe: boolean; reason?: string | undefined }> {
  const absTarget = resolve(targetPath);
  const absRoot = resolve(projectRoot);

  // Segment-aware containment check using path.relative
  const rel = relative(absRoot, absTarget);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return {
      safe: false,
      reason: `Path ${absTarget} resolves outside project boundary ${absRoot}.`,
    };
  }

  // Walk every existing component from project root to target
  const segments = rel.split(/[\\/]/);
  let currentPath = absRoot;

  for (const segment of segments) {
    currentPath = join(currentPath, segment);

    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        return {
          safe: false,
          reason: `Symbolic link detected at ${currentPath}. Refusing for safety.`,
        };
      }
    } catch (err: unknown) {
      // Path doesn't exist yet — that's fine for creation
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        break; // Remaining segments don't exist yet
      }
      return {
        safe: false,
        reason: `Cannot stat path: ${currentPath}. ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { safe: true };
}

/**
 * Verify all controlled paths within a .tamhees directory.
 * Checks each subdirectory for symbolic links.
 */
export async function verifyStorageTreeSafety(
  storagePath: string,
  projectRoot: string,
): Promise<{ safe: boolean; reason?: string | undefined }> {
  const controlledPaths = [
    storagePath,
    join(storagePath, 'memories'),
    join(storagePath, 'memories', 'records'),
    join(storagePath, 'evidence'),
    join(storagePath, 'audits'),
    join(storagePath, 'episodes'),
    join(storagePath, 'archive'),
    join(storagePath, 'runtime'),
  ];

  for (const p of controlledPaths) {
    const result = await verifyPathSafety(p, projectRoot);
    if (!result.safe) {
      return result;
    }
  }

  return { safe: true };
}

export interface ControlledFileRead {
  readonly name: string;
  /** File content when it was read safely. */
  readonly content?: string;
  /** Present when the file is a symbolic link or cannot be inspected. */
  readonly unsafeReason?: string;
  /** Present when the file was safe but could not be read. */
  readonly readFailed?: true;
}

const READ_CONCURRENCY = 32;

/**
 * Read many files from one controlled directory quickly and safely.
 *
 * The directory itself must already have passed verifyStorageTreeSafety (every
 * component checked for links). Each file then needs only one lstat of its own: a
 * symbolic link is refused with the same message verifyPathSafety produces. Files are
 * read concurrently (bounded) and results keep the order of `names`.
 */
export async function readControlledFiles(dir: string, names: readonly string[]): Promise<ControlledFileRead[]> {
  const results: ControlledFileRead[] = new Array(names.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < names.length) {
      const index = next++;
      const name = names[index]!;
      const path = join(dir, name);
      try {
        const stats = await lstat(path);
        if (stats.isSymbolicLink()) {
          results[index] = { name, unsafeReason: `Symbolic link detected at ${path}. Refusing for safety.` };
          continue;
        }
      } catch (err: unknown) {
        results[index] = { name, unsafeReason: `Cannot stat path: ${path}. ${err instanceof Error ? err.message : String(err)}` };
        continue;
      }
      try {
        results[index] = { name, content: await readFile(path, 'utf-8') };
      } catch {
        results[index] = { name, readFailed: true };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, names.length) }, () => worker()));
  return results;
}

/**
 * JSON replacer that sorts object keys deterministically.
 * Produces Git-friendly diffs with consistent key ordering.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}
