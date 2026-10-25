#!/usr/bin/env node
import { validTaskScope } from './core/scope.js';

/**
 * Tamhees — tamhees CLI
 *
 * The primary human interface to the engine.
 *
 * Exit codes:
 *   0  Success
 *   1  Operational or validation failure
 *   2  Invalid usage
 *
 * No telemetry. No network access.
 */

import { dirname, resolve } from 'node:path';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import {
  DEFAULT_CONTEXT_MAX_TOKENS,
  MAX_CONTEXT_MAX_TOKENS,
  MIN_CONTEXT_MAX_TOKENS,
  systemClock,
} from './core/types.js';
import { PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_EXPLANATION, CLI_NAME, LEGACY_STORAGE_DIR, STORAGE_DIR, ENGINE_VERSION } from './core/identity.js';
import { initTamhees, loadAllRecords } from './core/store.js';
import {
  compileContext,
  formatContextAsJson,
  formatContextAsMarkdown,
} from './core/context.js';
import {
  runAudit,
  writeAuditEvents,
  formatAuditResult,
} from './core/audit.js';
import { loadAllEvidence, storeEvidenceRecord } from './core/evidence.js';
import { applyUpdateCandidate } from './core/mutations.js';
import { memoryForOutput } from './core/privacy.js';
import { validateContextPack } from './core/validation.js';
import { beginLifecycle, finalizeLifecycle, formatLifecycleBeginAsMarkdown, formatLifecycleFinalizeAsMarkdown, randomLifecycleId } from './core/lifecycle.js';
import { loadBootstrapMigrationSource, migrateBootstrapClaims } from './core/migration.js';
import { migrateLegacyStorage } from './core/legacy-storage.js';
import { getAdapter, isAdapterName, listAdapterDefinitions } from './adapters/registry.js';
import { adapterStatus, installAdapter, removeAdapter } from './adapters/managed-files.js';
import { ADAPTER_NAMES } from './adapters/types.js';
import { runMcpStdio } from './mcp/stdio.js';
import { formatBenchmarkJson, formatBenchmarkMarkdown, runBenchmark } from './benchmark/benchmark.js';
import { atomicWriteText, verifyPathSafety } from './core/atomic-write.js';
import { formatObservationText, observeProject } from './core/observe.js';
import { REMEMBER_BASES, forgetMemory, formatInspectionText, inspectMemories, rememberMemory, revokeMemory, type RememberBasis } from './core/quick.js';
import { ACTION_PERMISSIONS, CONFIDENCE_VALUES, MEMORY_KINDS, type ActionPermission, type Confidence, type MemoryKind } from './core/types.js';

// ─── Argument parsing ───────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const MAX_JSON_INPUT_BYTES = 1024 * 1024;

function parseArgs(
  allowedOptions: string[],
  maxPositional: number,
  startIndex = 1,
  valueLessOptions: readonly string[] = [],
): { options: Record<string, string>; positional: string[] } {
  const options: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--help' || arg === '--version') continue; // Handled globally/early

    if (arg.startsWith('--')) {
      if (!allowedOptions.includes(arg)) {
        console.error(`Unknown option: ${arg}`);
        console.error(`Run ${CLI_NAME} ${command} --help for usage.`);
        process.exit(2);
      }
      if (options[arg] !== undefined) {
        console.error(`Duplicate option: ${arg}`);
        process.exit(2);
      }
      if (valueLessOptions.includes(arg)) {
        options[arg] = 'true';
        continue;
      }
      if (i + 1 >= args.length || args[i + 1]!.startsWith('--')) {
        console.error(`Missing value for option: ${arg}`);
        process.exit(2);
      }
      options[arg] = args[i + 1]!;
      i++; // Skip the value
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > maxPositional) {
    console.error(`Unexpected positional argument: ${positional[maxPositional]}`);
    console.error(`Run ${CLI_NAME} ${command} --help for usage.`);
    process.exit(2);
  }

  return { options, positional };
}

// ─── Help text ──────────────────────────────────────────────

const MAIN_HELP = `${CLI_NAME} v${ENGINE_VERSION} — ${PRODUCT_NAME}` + `\n${PRODUCT_TAGLINE}\n${PRODUCT_EXPLANATION}` + `

Usage: ${CLI_NAME} <command> [options]

Commands:
  init                Initialize ${STORAGE_DIR}/ in a project directory
  remember            Remember a claim with its source and freshness (no JSON needed)
  inspect             Show what is remembered and how sure ${PRODUCT_NAME} is
  forget              Forget a memory: erase its text, keep a safe tombstone
  revoke              Revoke a memory so it can no longer guide action
  observe             Check memories against the repository and find the ones that might be wrong
  memory              List, show, or apply controlled memory updates
  evidence            List or add evidence records
  context             Compile task-specific memory context
  audit               Run audit on all memory records
  lifecycle           Begin or finalize a controlled task lifecycle
  migrate             Run controlled legacy-storage or bootstrap migration
  adapter             Manage and use local agent adapters
  mcp                 Run the local stdio MCP server
  benchmark           Run the deterministic local benchmark

Options:
  --help              Show this help
  --version           Show version

Run '${CLI_NAME} <command> --help' for command-specific help.

No telemetry. No network access. Local-only operation.`;

const INIT_HELP = `${CLI_NAME} init — Initialize ${STORAGE_DIR}/ storage

Usage: ${CLI_NAME} init [directory]

Arguments:
  directory           Project directory to initialize (default: current directory)

Behavior:
  - Creates ${STORAGE_DIR}/ directory structure
  - Creates one bootstrap memory record (non-authoritative)
  - Is idempotent: running again does not destroy existing data
  - Never overwrites valid existing data
  - Stops with error if existing data is malformed

Exit codes:
  0  Success
  1  Initialization failed
  2  Invalid usage`;

const CONTEXT_HELP = `${CLI_NAME} context — Compile task-specific memory context

Usage: ${CLI_NAME} context --task "<description>" [options]

Options:
  --task <text>       Task description (required)
  --scope-input <file> Task applicability JSON (environment/component/path)
  --format <type>     Output format: json or markdown (default: json)
  --max-tokens <n>    Hard estimated-token budget (default: ${DEFAULT_CONTEXT_MAX_TOKENS}; range: ${MIN_CONTEXT_MAX_TOKENS}-${MAX_CONTEXT_MAX_TOKENS})

Behavior:
  - Loads and validates canonical memory records
  - Ranks eligible records deterministically by relevance, authority, freshness, and safety
  - Enforces the budget on the canonical selected-memory agent payload
  - Uses the documented UTF-8-byte estimator, not a vendor tokenizer
  - May return a valid empty pack when no complete memory contribution fits
  - Excludes SECRET and FORGET_OR_REDACT content
  - Does NOT persist the generated context pack
  - Does NOT write task text into project memory

Exit codes:
  0  Success
  1  Operational failure
  2  Invalid usage`;

const AUDIT_HELP = `${CLI_NAME} audit — Run audit on all memory records

Usage: ${CLI_NAME} audit

Behavior:
  - Loads and validates all canonical records
  - Applies implemented audit rules
  - Appends privacy-safe audit events to ${STORAGE_DIR}/audits/history.jsonl
  - Reports overall outcome and individual findings

Exit codes:
  0  All audited records satisfy TRUST conditions
  1  Audit returned RECHECK, ASK_OWNER, BLOCK_ACTION, or FORGET_OR_REDACT
  2  Invalid usage`;

const MEMORY_HELP = `${CLI_NAME} memory — Controlled memory operations

Usage:
  ${CLI_NAME} memory list
  ${CLI_NAME} memory show <memory-id>
  ${CLI_NAME} memory apply --input <candidate.json>

The input for apply follows the update-candidate contract in
docs/PROTOCOL_SPECIFICATION.md and supports CREATE, UPDATE, REVOKE, or REDACT.
All mutations validate authority, evidence, schema, privacy, archive behavior,
audit history, and index consistency before reporting success.`;

const EVIDENCE_HELP = `${CLI_NAME} evidence — Evidence record operations

Usage:
  ${CLI_NAME} evidence list
  ${CLI_NAME} evidence add --input <evidence.json>

Evidence is stored locally under ${STORAGE_DIR}/evidence/ after schema,
reference, path, and secret-like-content validation.`;

const REMEMBER_HELP = `${CLI_NAME} remember — Remember a claim with provenance and freshness

Usage: ${CLI_NAME} remember "<statement>" [options]

How the fact is known (sets source, authority, default permission and review date):
  --as inferred       An AI guess (default). Must be confirmed before it guides change.
  --as observed       Seen directly by the agent. Act with caution. Review in 90 days.
  --as repo           Verified in the repository. May act. Review in 180 days.
  --as test           Verified by a test result. May act. Review in 180 days.
  --as unknown        No verifiable source yet. Must be confirmed.
  Owner decisions are not created here: they need owner evidence (see memory apply).

Options:
  --source <ref>       Where it came from, e.g. package.json or a test name
  --tags <a,b,...>     Retrieval tags
  --kind <KIND>        ${MEMORY_KINDS.join(', ')}
  --confidence <level> high, medium (default) or low
  --permission <PERM>  ${ACTION_PERMISSIONS.filter((p) => p !== 'FORGET_OR_REDACT').join(', ')}
  --public             Mark as PUBLIC (default INTERNAL)
  --review-in <days>   Review date in days (0 = no review date)
  --expires-in <days>  Hard expiry in days; expired memories are withheld from agents
  --environment <name> Only applies in this environment
  --component <name>   Only applies to this component
  --path <dir>         Only applies under this project path
  --recheck <how>      How to re-verify it
  --id <memory-id>     Explicit ID (default: next DM-MEM-######)
  --by <agent-id>      Who is proposing it (default: ${'tamhees-cli'})
  --dry-run            Validate and show the record without storing it
  --format <type>      text (default) or json

Secret-like content is refused and nothing is stored.

Exit codes:
  0  Stored (or valid, with --dry-run)
  1  Rejected by validation, authority or privacy rules
  2  Invalid usage`;

const INSPECT_HELP = `${CLI_NAME} inspect — What do you remember, and how sure are you?

Usage:
  ${CLI_NAME} inspect [memory-id] [--format text|json]

For every memory (or one), shows the redacted statement, source, authority status,
confidence, freshness (current, review due, conditional or expired), scope,
permission, linked evidence, the current audit outcome in plain words, the next step,
and whether it would be withheld from agent context.

Inspection is read-only: unlike ${CLI_NAME} audit, it appends no audit events.`;

const FORGET_HELP = `${CLI_NAME} forget — Forget a memory

Usage: ${CLI_NAME} forget <memory-id> [--reason "<why>"] [--as-owner] [--by <agent-id>]

Runs the controlled REDACT operation: the statement and source are replaced in the
record, raw text is not copied to the archive or audit log, and a privacy-safe
tombstone keeps the audit trail. The memory is never served to agents again.
Owner-confirmed memories require --as-owner.`;

const REVOKE_HELP = `${CLI_NAME} revoke — Revoke a memory

Usage: ${CLI_NAME} revoke <memory-id> [--reason "<why>"] [--as-owner] [--by <agent-id>]

Marks the memory REVOKED with MUST_NOT_ACT. Its prior state is archived for history,
but it can no longer authorize action or appear in agent context. Use forget instead
when the text itself must not be kept. Owner-confirmed memories require --as-owner.`;

const OBSERVE_HELP = `${CLI_NAME} observe — Find memories the repository says might be wrong

Usage: ${CLI_NAME} observe [--record] [--format text|json]

Checks three kinds of claims in memory statements against the project itself:
  technology  "The project uses SQLite" vs dependencies, lockfiles and known config files
  script      "Run npm run build:legacy" vs package.json scripts
  path        "The handler is in src/pay.ts" vs whether that file exists

Without --record this is a preview and writes nothing. With --record, each finding is
stored as REPOSITORY_STATE evidence (SUPPORTS or CONTRADICTS) through the normal
validated evidence store. Contradicted memories are then blocked by the audit and
withheld from agent context. Re-running records nothing new unless the repository
changed.

Conservative by design:
  - Reads only a fixed list of manifest, lockfile and config files; never .env files,
    keys or source code. Path claims check existence only. Symlinks are not followed.
  - A technology is contradicted only when it is absent AND a competitor in the same
    group (database, test framework, package manager, ...) is present.
  - Statements with negation or change language, or naming several technologies of
    one group, are skipped rather than guessed. Sensitive, revoked, forgotten and
    restricted-scope memories are skipped.

Exit codes:
  0  Completed (findings may include contradictions)
  1  Store could not be loaded or evidence could not be recorded
  2  Invalid usage`;

// ─── Main dispatch ──────────────────────────────────────────

async function main(): Promise<void> {
  if (args.includes('--version')) {
    console.log(`${CLI_NAME} v${ENGINE_VERSION}`);
    process.exit(0);
  }

  if (!command || (args.includes('--help') && !['init', 'remember', 'inspect', 'forget', 'revoke', 'observe', 'memory', 'evidence', 'context', 'audit', 'lifecycle', 'migrate', 'adapter', 'mcp', 'benchmark'].includes(command))) {
    console.log(MAIN_HELP);
    process.exit(0);
  }

  switch (command) {
    case 'init':
      await handleInit();
      break;
    case 'remember':
      await handleRemember();
      break;
    case 'inspect':
      await handleInspect();
      break;
    case 'forget':
    case 'revoke':
      await handleRemoval(command);
      break;
    case 'observe':
      await handleObserve();
      break;
    case 'context':
      await handleContext();
      break;
    case 'audit':
      await handleAudit();
      break;
    case 'memory':
      await handleMemory();
      break;
    case 'evidence':
      await handleEvidence();
      break;
    case 'lifecycle':
      await handleLifecycle();
      break;
    case 'migrate':
      await handleMigrate();
      break;
    case 'adapter':
      await handleAdapter();
      break;
    case 'mcp':
      await handleMcp();
      break;
    case 'benchmark':
      await handleBenchmark();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(`Run ${CLI_NAME} --help for available commands.`);
      process.exit(2);
  }
}

// ─── Init handler ───────────────────────────────────────────

async function handleInit(): Promise<void> {
  if (args.includes('--help')) {
    console.log(INIT_HELP);
    process.exit(0);
  }

  const { positional } = parseArgs([], 1);
  const targetDir = positional[0] ? resolve(positional[0]) : process.cwd();

  console.log(`Initializing ${STORAGE_DIR}/ in ${targetDir}`);
  console.log('');

  const result = await initTamhees(targetDir, systemClock);

  if (result.created.length > 0) {
    console.log('Created:');
    for (const file of result.created) {
      console.log(`  + ${file}`);
    }
  }

  if (result.existing.length > 0) {
    console.log('Already exists (preserved):');
    for (const file of result.existing) {
      console.log(`  = ${file}`);
    }
  }

  if (result.bootstrapMemoryId) {
    console.log('');
    console.log(`Bootstrap memory: ${result.bootstrapMemoryId}`);
  }

  if (!result.success) {
    console.error('');
    console.error('Errors:');
    for (const error of result.errors) {
      console.error(`  ! ${error}`);
    }
    process.exit(1);
  }

  console.log('');
  console.log('Initialization complete.');
  process.exit(0);
}

// ─── Context handler ────────────────────────────────────────

async function handleContext(): Promise<void> {
  if (args.includes('--help')) {
    console.log(CONTEXT_HELP);
    process.exit(0);
  }

  const { options } = parseArgs(['--task', '--format', '--scope-input', '--max-tokens'], 0);

  const task = options['--task'];
  if (!task) {
    console.error('Missing required option: --task');
    console.error(`Usage: ${CLI_NAME} context --task "<description>"`);
    process.exit(2);
  }

  const format = options['--format'] || 'json';
  if (format !== 'json' && format !== 'markdown') {
    console.error(`Unknown format: ${format}. Use json or markdown.`);
    process.exit(2);
  }

  const maxTokensText = options['--max-tokens'];
  const maxTokens = maxTokensText === undefined
    ? DEFAULT_CONTEXT_MAX_TOKENS
    : parseContextMaxTokens(maxTokensText);

  const projectDir = process.cwd();
  const { records, errors } = await loadAllRecords(projectDir);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`Error: ${error}`);
    }
    process.exit(1);
  }

  const evidenceResult = await loadAllEvidence(projectDir);
  if (evidenceResult.errors.length > 0) {
    for (const error of evidenceResult.errors) console.error(`Error: ${error}`);
    process.exit(1);
  }

  const pack = compileContext(task, records, systemClock, evidenceResult.evidence, { maxTokens, scope: await readTaskScope(options['--scope-input']) });
  const validation = validateContextPack(pack);
  if (!validation.valid) {
    console.error('Generated context pack failed internal validation. Raw context content was not echoed.');
    process.exit(1);
  }

  if (format === 'markdown') {
    console.log(formatContextAsMarkdown(pack));
  } else {
    console.log(formatContextAsJson(pack));
  }

  process.exit(0);
}

function parseContextMaxTokens(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    usageError(`--max-tokens must be a positive integer from ${MIN_CONTEXT_MAX_TOKENS} to ${MAX_CONTEXT_MAX_TOKENS}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_CONTEXT_MAX_TOKENS || parsed > MAX_CONTEXT_MAX_TOKENS) {
    usageError(`--max-tokens must be a positive integer from ${MIN_CONTEXT_MAX_TOKENS} to ${MAX_CONTEXT_MAX_TOKENS}.`);
  }
  return parsed;
}

// ─── Audit handler ──────────────────────────────────────────

async function handleAudit(): Promise<void> {
  if (args.includes('--help')) {
    console.log(AUDIT_HELP);
    process.exit(0);
  }

  parseArgs([], 0); // No options or positional args allowed

  const projectDir = process.cwd();
  const { records, errors } = await loadAllRecords(projectDir);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`Error: ${error}`);
    }
    process.exit(1);
  }

  if (records.length === 0) {
    console.log(`No memory records found. Run ${CLI_NAME} init first.`);
    process.exit(0);
  }

  const evidenceResult = await loadAllEvidence(projectDir);
  if (evidenceResult.errors.length > 0) {
    for (const error of evidenceResult.errors) console.error(`Error: ${error}`);
    process.exit(1);
  }

  const result = runAudit(records, systemClock, evidenceResult.evidence);

  const formattedResult = formatAuditResult(result);
  console.log(formattedResult);

  // Write audit events to JSONL
  try {
    await writeAuditEvents(projectDir, result, records, systemClock, evidenceResult.evidence);
  } catch (err: unknown) {
    console.error(`Error writing audit events: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Exit code based on overall outcome
  const exitCode = result.overallOutcome === 'TRUST' ? 0 : 1;
  process.exit(exitCode);
}

// ─── Memory operations ─────────────────────────────────────

async function handleMemory(): Promise<void> {
  if (args.includes('--help')) {
    console.log(MEMORY_HELP);
    process.exit(0);
  }
  const subcommand = args[1];
  if (subcommand === 'list') {
    parseArgs([], 0, 2);
    const loaded = await loadAllRecords(process.cwd());
    if (loaded.errors.length > 0) return exitWithErrors(loaded.errors);
    console.log(JSON.stringify(loaded.records.map(memoryForOutput), null, 2));
    process.exit(0);
  }
  if (subcommand === 'show') {
    const { positional } = parseArgs([], 1, 2);
    const memoryId = positional[0];
    if (!memoryId) return usageError(`Usage: ${CLI_NAME} memory show <memory-id>`);
    const loaded = await loadAllRecords(process.cwd());
    if (loaded.errors.length > 0) return exitWithErrors(loaded.errors);
    const record = loaded.records.find((item) => item.id === memoryId);
    if (!record) {
      console.error(`Memory not found: ${memoryId}`);
      process.exit(1);
    }
    console.log(JSON.stringify(memoryForOutput(record), null, 2));
    process.exit(0);
  }
  if (subcommand === 'apply') {
    const { options } = parseArgs(['--input'], 0, 2);
    const inputPath = options['--input'];
    if (!inputPath) return usageError(`Usage: ${CLI_NAME} memory apply --input <candidate.json>`);
    let parsed: unknown;
    try {
      parsed = await readJsonInput(inputPath);
    } catch {
      console.error('Cannot read update candidate. Use a regular UTF-8 JSON file no larger than 1 MiB. Raw input was not echoed.');
      process.exit(1);
    }
    const result = await applyUpdateCandidate(process.cwd(), parsed, systemClock);
    if (!result.success) {
      for (const item of result.errors) console.error(`Error [${item.code}] ${item.field || 'candidate'}: ${item.message}`);
      process.exit(1);
    }
    console.log(JSON.stringify({ ...result, record: result.record ? memoryForOutput(result.record) : null }, null, 2));
    process.exit(0);
  }
  usageError(`Unknown memory operation: ${subcommand ?? '<missing>'}. Run ${CLI_NAME} memory --help.`);
}

// ─── Everyday memory operations ────────────────────────────

function parseDays(option: string, value: string | undefined, min: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,5}$/.test(value) || Number(value) < min) {
    return usageError(`${option} must be a whole number of days${min > 0 ? ` of at least ${min}` : ''}.`);
  }
  return Number(value);
}

function parseFormat(value: string | undefined): 'text' | 'json' {
  if (value === undefined || value === 'text') return 'text';
  if (value === 'json') return 'json';
  return usageError('--format must be text or json.');
}

async function handleRemember(): Promise<void> {
  if (args.includes('--help')) {
    console.log(REMEMBER_HELP);
    process.exit(0);
  }
  const { options, positional } = parseArgs(
    ['--as', '--source', '--tags', '--kind', '--confidence', '--permission', '--public', '--review-in',
      '--expires-in', '--environment', '--component', '--path', '--recheck', '--id', '--by', '--dry-run', '--format'],
    1, 1, ['--public', '--dry-run'],
  );
  const statement = positional[0];
  if (!statement || statement.trim() === '') return usageError(`Usage: ${CLI_NAME} remember "<statement>" [options]`);
  const basis = options['--as'] ?? 'inferred';
  if (!(REMEMBER_BASES as readonly string[]).includes(basis)) {
    return usageError(`--as must be one of: ${REMEMBER_BASES.join(', ')}.`);
  }
  const kind = options['--kind']?.toUpperCase();
  if (kind !== undefined && !(MEMORY_KINDS as readonly string[]).includes(kind)) {
    return usageError(`--kind must be one of: ${MEMORY_KINDS.join(', ')}.`);
  }
  const confidence = options['--confidence']?.toUpperCase();
  if (confidence !== undefined && !(CONFIDENCE_VALUES as readonly string[]).includes(confidence)) {
    return usageError('--confidence must be high, medium or low.');
  }
  const permission = options['--permission']?.toUpperCase();
  if (permission !== undefined && (!(ACTION_PERMISSIONS as readonly string[]).includes(permission) || permission === 'FORGET_OR_REDACT')) {
    return usageError(`--permission must be one of: ${ACTION_PERMISSIONS.filter((p) => p !== 'FORGET_OR_REDACT').join(', ')}.`);
  }
  const format = parseFormat(options['--format']);
  const scope = {
    ...(options['--environment'] !== undefined ? { environment: options['--environment'] } : {}),
    ...(options['--component'] !== undefined ? { component: options['--component'] } : {}),
    ...(options['--path'] !== undefined ? { path: options['--path'] } : {}),
  };
  const result = await rememberMemory(process.cwd(), {
    statement,
    basis: basis as RememberBasis,
    sourceReference: options['--source'],
    kind: kind as MemoryKind | undefined,
    tags: options['--tags']?.split(','),
    confidence: confidence as Confidence | undefined,
    permission: permission as ActionPermission | undefined,
    sensitivity: options['--public'] !== undefined ? 'PUBLIC' : 'INTERNAL',
    reviewInDays: parseDays('--review-in', options['--review-in'], 0),
    expiresInDays: parseDays('--expires-in', options['--expires-in'], 1),
    scope: Object.keys(scope).length > 0 ? scope : undefined,
    recheckMethod: options['--recheck'],
    id: options['--id'],
    proposer: options['--by'],
  }, systemClock, options['--dry-run'] !== undefined);
  if (!result.success) {
    for (const item of result.errors) console.error(`Error [${item.code}] ${item.field || 'candidate'}: ${item.message}`);
    process.exit(1);
  }
  const record = result.record ?? result.candidate?.proposedRecord ?? null;
  if (format === 'json') {
    console.log(JSON.stringify({ dryRun: options['--dry-run'] !== undefined, record: record ? memoryForOutput(record) : null }, null, 2));
    process.exit(0);
  }
  if (record) {
    const safe = memoryForOutput(record);
    console.log(`${options['--dry-run'] !== undefined ? 'Valid (not stored)' : 'Remembered'} ${safe.id}: ${safe.statement}`);
    console.log(`  ${safe.verificationStatus} · confidence ${safe.confidence} · permission ${safe.actionPermission}`
      + `${safe.freshness.reviewAfter ? ` · review by ${safe.freshness.reviewAfter.slice(0, 10)}` : ''}`
      + `${safe.freshness.expiresAfter ? ` · expires ${safe.freshness.expiresAfter.slice(0, 10)}` : ''}`);
  }
  process.exit(0);
}

async function handleInspect(): Promise<void> {
  if (args.includes('--help')) {
    console.log(INSPECT_HELP);
    process.exit(0);
  }
  const { options, positional } = parseArgs(['--format'], 1, 1);
  const format = parseFormat(options['--format']);
  const inspected = await inspectMemories(process.cwd(), systemClock);
  if (!inspected.success) return exitWithErrors(inspected.errors);
  let report = inspected.report;
  const memoryId = positional[0];
  if (memoryId !== undefined) {
    const memories = report.memories.filter((memory) => memory.id === memoryId);
    if (memories.length === 0) {
      console.error(`Memory not found: ${memoryId}`);
      process.exit(1);
    }
    const byOutcome = { TRUST: 0, RECHECK: 0, ASK_OWNER: 0, BLOCK_ACTION: 0, FORGET_OR_REDACT: 0 };
    byOutcome[memories[0]!.outcome] = 1;
    report = { ...report, total: 1, byOutcome, memories };
  }
  console.log(format === 'json' ? JSON.stringify(report, null, 2) : formatInspectionText(report));
  process.exit(0);
}

async function handleRemoval(kind: 'forget' | 'revoke'): Promise<void> {
  if (args.includes('--help')) {
    console.log(kind === 'forget' ? FORGET_HELP : REVOKE_HELP);
    process.exit(0);
  }
  const { options, positional } = parseArgs(['--reason', '--as-owner', '--by'], 1, 1, ['--as-owner']);
  const memoryId = positional[0];
  if (!memoryId) return usageError(`Usage: ${CLI_NAME} ${kind} <memory-id> [--reason "<why>"] [--as-owner]`);
  const removal = { reason: options['--reason'], asOwner: options['--as-owner'] !== undefined, proposer: options['--by'] };
  const result = kind === 'forget'
    ? await forgetMemory(process.cwd(), memoryId, removal, systemClock)
    : await revokeMemory(process.cwd(), memoryId, removal, systemClock);
  if (!result.success) {
    for (const item of result.errors) console.error(`Error [${item.code}] ${item.field || 'candidate'}: ${item.message}`);
    process.exit(1);
  }
  console.log(kind === 'forget'
    ? `Forgot ${memoryId}: its text was erased and it will not be shown to agents again. A privacy-safe tombstone keeps the audit trail.`
    : `Revoked ${memoryId}: it can no longer guide action. Its earlier state is archived for history.`);
  process.exit(0);
}

async function handleObserve(): Promise<void> {
  if (args.includes('--help')) {
    console.log(OBSERVE_HELP);
    process.exit(0);
  }
  const { options } = parseArgs(['--record', '--format'], 0, 1, ['--record']);
  const format = parseFormat(options['--format']);
  const record = options['--record'] !== undefined;
  const result = await observeProject(process.cwd(), systemClock, record);
  if (result.report === null) return exitWithErrors(result.errors);
  console.log(format === 'json'
    ? JSON.stringify({ record, ...result }, null, 2)
    : formatObservationText(result, record));
  process.exit(result.success ? 0 : 1);
}

// ─── Evidence operations ───────────────────────────────────

async function handleEvidence(): Promise<void> {
  if (args.includes('--help')) {
    console.log(EVIDENCE_HELP);
    process.exit(0);
  }
  const subcommand = args[1];
  if (subcommand === 'list') {
    parseArgs([], 0, 2);
    const loaded = await loadAllEvidence(process.cwd());
    if (loaded.errors.length > 0) return exitWithErrors(loaded.errors);
    console.log(JSON.stringify(loaded.evidence, null, 2));
    process.exit(0);
  }
  if (subcommand === 'add') {
    const { options } = parseArgs(['--input'], 0, 2);
    const inputPath = options['--input'];
    if (!inputPath) return usageError(`Usage: ${CLI_NAME} evidence add --input <evidence.json>`);
    let parsed: unknown;
    try {
      parsed = await readJsonInput(inputPath);
    } catch {
      console.error('Cannot read evidence input. Use a regular UTF-8 JSON file no larger than 1 MiB. Raw input was not echoed.');
      process.exit(1);
    }
    const result = await storeEvidenceRecord(process.cwd(), parsed);
    if (!result.success) {
      for (const item of result.errors) console.error(`Error [${item.code}] ${item.field || 'evidence'}: ${item.message}`);
      process.exit(1);
    }
    console.log(JSON.stringify(result.record, null, 2));
    process.exit(0);
  }
  usageError(`Unknown evidence operation: ${subcommand ?? '<missing>'}. Run ${CLI_NAME} evidence --help.`);
}

function exitWithErrors(errors: readonly string[]): never {
  for (const error of errors) console.error(`Error: ${error}`);
  process.exit(1);
}

function usageError(message: string): never {
  console.error(message);
  process.exit(2);
}

async function readJsonInput(inputPath: string): Promise<unknown> {
  const path = resolve(inputPath);
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error('Input must be a regular file, not a symbolic link or directory.');
  }
  if (info.size > MAX_JSON_INPUT_BYTES) {
    throw new Error(`Input exceeds the ${MAX_JSON_INPUT_BYTES}-byte safety limit.`);
  }
  return JSON.parse((await readFile(path, 'utf-8')).replace(/^\uFEFF/, '')) as unknown;
}

// ─── Entry point ────────────────────────────────────────────

// Phase 4 controlled lifecycle and bootstrap migration.
async function handleLifecycle(): Promise<void> {
  const subcommand = args[1];
  if (args.includes('--help')) {
    console.log(`${CLI_NAME} lifecycle\n\nUsage:\n  ${CLI_NAME} lifecycle begin --task "<description>" [--scope-input <task-scope.json>] [--max-tokens <n>] [--format json|markdown]\n  ${CLI_NAME} lifecycle finalize --input <finalization.json> [--format json|markdown]\n\nTask text and generated context are returned ephemerally and are not persisted.`);
    process.exit(0);
  }
  if (subcommand === 'begin') {
    const { options } = parseArgs(['--task','--scope-input','--max-tokens','--format'],0,2);
    const task=options['--task']; if(!task) return usageError(`Usage: ${CLI_NAME} lifecycle begin --task "<description>"`);
    const format=options['--format']??'json'; if(format!=='json'&&format!=='markdown') return usageError('Lifecycle format must be json or markdown.');
    const maxTokens=options['--max-tokens']===undefined?DEFAULT_CONTEXT_MAX_TOKENS:parseContextMaxTokens(options['--max-tokens']);
    const result=await beginLifecycle(process.cwd(),task,systemClock,randomLifecycleId,{maxTokens, scope: await readTaskScope(options['--scope-input'])});
    console.log(format==='markdown'?formatLifecycleBeginAsMarkdown(result):JSON.stringify(result,null,2)); process.exit(result.success?0:1);
  }
  if (subcommand === 'finalize') {
    const { options }=parseArgs(['--input','--format'],0,2); const input=options['--input']; if(!input)return usageError(`Usage: ${CLI_NAME} lifecycle finalize --input <finalization.json>`);
    const format=options['--format']??'json'; if(format!=='json'&&format!=='markdown')return usageError('Lifecycle format must be json or markdown.');
    let parsed:unknown; try{parsed=await readJsonInput(input);}catch{console.error('Cannot read lifecycle input. Use a regular UTF-8 JSON file no larger than 1 MiB. Raw input was not echoed.');process.exit(1);}
    const result=await finalizeLifecycle(process.cwd(),parsed,systemClock); console.log(format==='markdown'?formatLifecycleFinalizeAsMarkdown(result):JSON.stringify(result,null,2)); process.exit(result.success?0:1);
  }
  usageError(`Unknown lifecycle operation: ${subcommand??'<missing>'}. Run ${CLI_NAME} lifecycle --help.`);
}

async function handleMigrate(): Promise<void> {
  const subcommand = args[1];
  if (args.includes('--help')) {
    console.log(`${CLI_NAME} migrate\n\nUsage:\n  ${CLI_NAME} migrate legacy-storage [--dry-run]\n  ${CLI_NAME} migrate bootstrap [--input <markdown-file>]\n\nlegacy-storage validates and explicitly renames ${LEGACY_STORAGE_DIR}/ to ${STORAGE_DIR}/ without merging or overwriting. --dry-run changes no byte.\nbootstrap imports the preserved claim ledger once; its source Markdown is not modified or deleted.`);
    process.exit(0);
  }
  if (subcommand === 'legacy-storage') {
    const { options } = parseArgs(['--dry-run'], 0, 2, ['--dry-run']);
    const result = await migrateLegacyStorage(process.cwd(), options['--dry-run'] === 'true');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }
  if (subcommand === 'bootstrap') {
    const { options } = parseArgs(['--input'], 0, 2);
    const input = resolve(options['--input'] ?? joinPath('memory', 'MEMORY_CLAIMS.md'));
    const source = await loadBootstrapMigrationSource(process.cwd(), input);
    if (!source.success || source.markdown === null) {
      console.log(JSON.stringify(source, null, 2));
      process.exit(1);
    }
    const result = await migrateBootstrapClaims(process.cwd(), source.markdown, systemClock);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }
  usageError(`Usage: ${CLI_NAME} migrate legacy-storage [--dry-run]`);
}

function joinPath(...parts:string[]):string{return resolve(process.cwd(),...parts);}

async function handleAdapter(): Promise<void> {
  const subcommand = args[1];
  if (args.includes('--help')) {
    console.log(`${CLI_NAME} adapter\n\nUsage:\n  ${CLI_NAME} adapter list\n  ${CLI_NAME} adapter status --agent <${ADAPTER_NAMES.join('|')}>\n  ${CLI_NAME} adapter install --agent <name> [--dry-run]\n  ${CLI_NAME} adapter remove --agent <name> [--dry-run]\n  ${CLI_NAME} adapter begin --agent <name> --task "<description>" [--scope-input <task-scope.json>] [--max-tokens <n>] [--format json|markdown]\n  ${CLI_NAME} adapter finalize --agent <name> --input <finalization.json> [--format json|markdown]\n\nManaged installs are project-local, atomic, idempotent, and preserve bytes outside the marked block.`);
    process.exit(0);
  }
  if (subcommand === 'list') {
    parseArgs([], 0, 2);
    console.log(JSON.stringify(listAdapterDefinitions(), null, 2));
    process.exit(0);
  }
  if (!['status', 'install', 'remove', 'begin', 'finalize'].includes(subcommand ?? '')) return usageError(`Unknown adapter operation: ${subcommand ?? '<missing>'}. Run ${CLI_NAME} adapter --help.`);
  const allowed = subcommand === 'begin' ? ['--agent','--task','--scope-input','--max-tokens','--format']
    : subcommand === 'finalize' ? ['--agent','--input','--format']
      : subcommand === 'status' ? ['--agent'] : ['--agent','--dry-run'];
  const { options } = parseArgs(allowed, 0, 2, ['--dry-run']);
  const agent = options['--agent'];
  if (!agent || !isAdapterName(agent)) return usageError(`--agent must be one of: ${ADAPTER_NAMES.join(', ')}.`);
  if (subcommand === 'status') return printAdapterResult(await adapterStatus(process.cwd(), agent));
  if (subcommand === 'install') return printAdapterResult(await installAdapter(process.cwd(), agent, options['--dry-run'] === 'true'));
  if (subcommand === 'remove') return printAdapterResult(await removeAdapter(process.cwd(), agent, options['--dry-run'] === 'true'));
  const adapter = getAdapter(agent);
  const format = options['--format'] ?? 'json';
  if (format !== 'json' && format !== 'markdown') return usageError('Adapter format must be json or markdown.');
  if (subcommand === 'begin') {
    const task = options['--task']; if (!task) return usageError('Adapter begin requires --task.');
    const maxTokens = options['--max-tokens'] === undefined ? DEFAULT_CONTEXT_MAX_TOKENS : parseContextMaxTokens(options['--max-tokens']);
    const result = await adapter.begin(process.cwd(), task, { maxTokens, scope: await readTaskScope(options['--scope-input']) });
    console.log(format === 'markdown' ? formatLifecycleBeginAsMarkdown(result) : JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }
  const inputPath = options['--input']; if (!inputPath) return usageError('Adapter finalize requires --input.');
  let input: unknown; try { input = await readJsonInput(inputPath); } catch { console.error('Cannot read adapter finalization input safely. Raw input was not echoed.'); process.exit(1); }
  const result = await adapter.finalize(process.cwd(), input);
  console.log(format === 'markdown' ? formatLifecycleFinalizeAsMarkdown(result) : JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

function printAdapterResult(result: { readonly success: boolean }): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

async function handleMcp(): Promise<void> {
  if (args.includes('--help')) { console.log(`${CLI_NAME} mcp serve\n\nRuns the local JSON-RPC 2.0 stdio MCP server. Protocol output uses stdout exclusively; diagnostics use stderr.`); process.exit(0); }
  if (args[1] !== 'serve') return usageError(`Usage: ${CLI_NAME} mcp serve`);
  parseArgs([], 0, 2);
  await runMcpStdio(process.cwd());
}

async function handleBenchmark(): Promise<void> {
  if (args.includes('--help')) { console.log(`${CLI_NAME} benchmark run [--format json|markdown] [--output <safe-path>]\n\nRuns all four deterministic local benchmark configurations without network access.`); process.exit(0); }
  if (args[1] !== 'run') return usageError(`Usage: ${CLI_NAME} benchmark run [--format json|markdown] [--output <safe-path>]`);
  const { options } = parseArgs(['--format','--output'], 0, 2);
  const format = options['--format'] ?? 'json';
  if (format !== 'json' && format !== 'markdown') return usageError('Benchmark format must be json or markdown.');
  const report = runBenchmark();
  const content = format === 'json' ? formatBenchmarkJson(report) : formatBenchmarkMarkdown(report);
  const output = options['--output'];
  if (!output) { process.stdout.write(content); process.exit(0); }
  const root = resolve(process.cwd());
  const path = resolve(root, output);
  const safety = await verifyPathSafety(path, root);
  if (!safety.safe) { console.error('Benchmark output path is unsafe.'); process.exit(1); }
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteText(path, content, { allowOverwrite: true });
  console.log(JSON.stringify({ success: true, output: path, format }, null, 2));
  process.exit(0);
}
main().catch((err: unknown) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

async function readTaskScope(path: string | undefined): Promise<import('./core/types.js').TaskScope> {
  const scope: unknown = path === undefined ? {} : await readJsonInput(path);
  if (!validTaskScope(scope)) throw new Error('Invalid task scope.');
  return scope;
}
