import { lstat, mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { atomicWriteText, verifyPathSafety } from '../core/atomic-write.js';
import { CLI_NAME, MANAGED_BLOCK_END, MANAGED_BLOCK_ORIGIN_PREFIX, MANAGED_BLOCK_START, PRODUCT_NAME } from '../core/identity.js';
import { getAdapter } from './registry.js';
import type { AdapterChangeResult, AdapterName, AdapterStatusResult } from './types.js';

const START = MANAGED_BLOCK_START;
const END = MANAGED_BLOCK_END;

interface Inspection {
  readonly state: AdapterStatusResult['state'];
  readonly count: number;
  readonly bytes: Buffer;
  readonly start: number;
  readonly end: number;
  readonly exists: boolean;
  readonly createdByInstaller: boolean;
  readonly error?: string;
}

export async function adapterStatus(projectDir: string, agent: AdapterName): Promise<AdapterStatusResult> {
  const target = await safeTarget(projectDir, agent);
  if (!target.success) return { success: false, agent, path: target.path, state: 'CORRUPT', managedBlockCount: 0, errors: [target.error] };
  const inspected = await inspect(target.path, agent);
  return {
    success: inspected.state !== 'CORRUPT', agent, path: target.relativePath,
    state: inspected.state, managedBlockCount: inspected.count,
    errors: inspected.error ? [inspected.error] : [],
  };
}

export async function installAdapter(projectDir: string, agent: AdapterName, dryRun = false): Promise<AdapterChangeResult> {
  return changeAdapter(projectDir, agent, 'install', dryRun);
}

export async function removeAdapter(projectDir: string, agent: AdapterName, dryRun = false): Promise<AdapterChangeResult> {
  return changeAdapter(projectDir, agent, 'remove', dryRun);
}

async function changeAdapter(projectDir: string, agent: AdapterName, action: 'install' | 'remove', dryRun: boolean): Promise<AdapterChangeResult> {
  const target = await safeTarget(projectDir, agent);
  if (!target.success) return failure(agent, target.path, action, dryRun, target.error);
  const inspected = await inspect(target.path, agent);
  if (inspected.state === 'CORRUPT') return failure(agent, target.relativePath, action, dryRun, inspected.error ?? 'Managed block is corrupt.', inspected.count);

  if (action === 'install' && inspected.state === 'INSTALLED') {
    return success(agent, target.relativePath, action, dryRun, false, 'INSTALLED', 1);
  }
  if (action === 'remove' && inspected.state === 'ABSENT') {
    return success(agent, target.relativePath, action, dryRun, false, 'ABSENT', 0);
  }

  const replacement = action === 'install'
    ? addBlock(inspected.bytes, managedBlock(agent, !inspected.exists))
    : Buffer.concat([inspected.bytes.subarray(0, inspected.start), inspected.bytes.subarray(inspected.end)]);
  if (!dryRun) {
    await mkdir(dirname(target.path), { recursive: true });
    const safety = await verifyPathSafety(target.path, resolve(projectDir));
    if (!safety.safe) return failure(agent, target.relativePath, action, dryRun, safety.reason ?? 'Target path is unsafe.');
    if (action === 'remove' && inspected.createdByInstaller && replacement.length === 0) await unlink(target.path);
    else await atomicWriteText(target.path, replacement.toString('utf8'), { allowOverwrite: true });
  }
  return success(agent, target.relativePath, action, dryRun, true, action === 'install' ? 'INSTALLED' : 'ABSENT', action === 'install' ? 1 : 0);
}

function managedBlock(agent: AdapterName, created: boolean): Buffer {
  const lines = agent === 'mcp'
    ? [
      START,
      `${MANAGED_BLOCK_ORIGIN_PREFIX}${created ? 'CREATED' : 'EXISTING'} -->`,
      `# ${PRODUCT_NAME} local MCP`,
      '',
      `Start the project-local JSON-RPC 2.0 stdio server with \`${CLI_NAME} mcp serve\`.`,
      'Protocol revision: `2025-11-25`. Transport: one UTF-8 JSON object per line.',
      'Keep this configuration project-local; do not add a global MCP configuration.',
      END,
    ]
    : [
      START,
      `${MANAGED_BLOCK_ORIGIN_PREFIX}${created ? 'CREATED' : 'EXISTING'} -->`,
      `# ${PRODUCT_NAME} task lifecycle`,
      '',
      `Before task work, run \`${CLI_NAME} adapter begin --agent ${agent} --task "<task>"\`.`,
      `After task work, submit controlled proposals with \`${CLI_NAME} adapter finalize --agent ${agent} --input <finalization.json>\`.`,
      'Generated context is ephemeral. Never persist secrets, elevate inferred authority, or bypass owner-confirmation boundaries.',
      END,
    ];
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function addBlock(existing: Buffer, block: Buffer): Buffer {
  return Buffer.concat([existing, block]);
}

async function inspect(path: string, agent: AdapterName): Promise<Inspection> {
  let bytes: Buffer;
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) return corrupt(Buffer.alloc(0), 'Adapter instruction target must be a regular file.');
    if (info.size > 1_048_576) return corrupt(Buffer.alloc(0), 'Adapter instruction target exceeds 1 MiB.');
    bytes = await readFile(path);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: 'ABSENT', count: 0, bytes: Buffer.alloc(0), start: -1, end: -1, exists: false, createdByInstaller: false };
    }
    return corrupt(Buffer.alloc(0), 'Adapter instruction target could not be read safely.');
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return corrupt(bytes, 'Adapter instruction target is not valid UTF-8.'); }
  const starts = indexes(text, START);
  const ends = indexes(text, END);
  if (starts.length === 0 && ends.length === 0) return { state: 'ABSENT', count: 0, bytes, start: -1, end: -1, exists: true, createdByInstaller: false };
  if (starts.length !== 1 || ends.length !== 1 || starts[0]! >= ends[0]!) return corrupt(bytes, 'Managed markers are duplicate, nested, missing, or out of order.', starts.length);
  const start = Buffer.byteLength(text.slice(0, starts[0]!), 'utf8');
  let endChar = ends[0]! + END.length;
  if (text.slice(endChar, endChar + 2) === '\r\n') endChar += 2;
  else if (text[endChar] === '\n') endChar += 1;
  const end = Buffer.byteLength(text.slice(0, endChar), 'utf8');
  const managedBytes = bytes.subarray(start, end);
  const matchesCreated = managedBytes.equals(managedBlock(agent, true));
  const matchesExisting = managedBytes.equals(managedBlock(agent, false));
  if (!matchesCreated && !matchesExisting) {
    return corrupt(bytes, 'Managed block content was modified or does not match the registered adapter.', 1);
  }
  return { state: 'INSTALLED', count: 1, bytes, start, end, exists: true, createdByInstaller: matchesCreated };
}

function indexes(text: string, marker: string): number[] {
  const result: number[] = [];
  for (let at = text.indexOf(marker); at >= 0; at = text.indexOf(marker, at + marker.length)) result.push(at);
  return result;
}

async function safeTarget(projectDir: string, agent: AdapterName): Promise<{ success: true; path: string; relativePath: string } | { success: false; path: string; error: string }> {
  const root = resolve(projectDir);
  const relativePath = getAdapter(agent).definition.instructionPath;
  const path = resolve(root, relativePath);
  const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) return { success: false, path: relativePath, error: 'Adapter target escapes the project boundary.' };
  const safety = await verifyPathSafety(path, root);
  if (!safety.safe) return { success: false, path: relativePath, error: safety.reason ?? 'Adapter target is unsafe.' };
  try {
    const rootInfo = await stat(root);
    if (!rootInfo.isDirectory()) return { success: false, path: relativePath, error: 'Project root is not a directory.' };
  } catch { return { success: false, path: relativePath, error: 'Project root cannot be inspected.' }; }
  return { success: true, path, relativePath: relativePath.replace(/\\/g, '/') };
}

function corrupt(bytes: Buffer, error: string, count = 0): Inspection { return { state: 'CORRUPT', count, bytes, start: -1, end: -1, exists: true, createdByInstaller: false, error }; }
function failure(agent: AdapterName, path: string, action: 'install'|'remove', dryRun: boolean, error: string, count = 0): AdapterChangeResult {
  return { success: false, agent, path, state: 'CORRUPT', managedBlockCount: count, errors: [error], changed: false, dryRun, action };
}
function success(agent: AdapterName, path: string, action: 'install'|'remove', dryRun: boolean, changed: boolean, state: AdapterStatusResult['state'], count: number): AdapterChangeResult {
  return { success: true, agent, path, state, managedBlockCount: count, errors: [], changed, dryRun, action };
}
