// Tamhees failure test: what happens when memory goes wrong.
//
//   npm run failure-test        (builds first)
//   node scripts/failure-test.mjs [--keep]
//
// Drives the real `tamhees` CLI in a throw-away project directory and shows, step by
// step, how the engine handles the failure cases named in the challenge brief:
//
//   1. Contradictory facts   - a remembered decision meets current evidence that disagrees
//   2. Stale data            - a remembered instruction passes its expiry date
//   3. "I might be wrong"    - a confident AI guess is not treated as owner approval
//   4. Privacy revocation    - the user withdraws a personal memory; it must be forgotten
//   5. Unsafe write          - a secret-like value is refused before it is ever stored
//   6. Self-detection        - nobody reports the change; `tamhees observe` notices it
//
// Every step asserts the expected outcome, so this script doubles as an end-to-end test
// (it exits non-zero if any behavior changes). Nothing leaves the machine.

import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'dist', 'src', 'cli.js');
const keep = process.argv.includes('--keep');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (offsetDays) => new Date(now + offsetDays * DAY).toISOString();

const failures = [];
const summary = [];
let project;

function heading(title) {
  console.log(`\n${'═'.repeat(72)}\n${title}\n${'═'.repeat(72)}`);
}
function say(text) {
  console.log(`  ${text}`);
}
function check(label, condition, detail = '') {
  console.log(`  ${condition ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(label);
  return condition;
}

async function tamhees(...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd: project });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function input(name, value) {
  const path = join(project, `${name}.json`);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function memory(id, fields) {
  return {
    schemaVersion: '1.0.0',
    id,
    scope: { kind: 'PROJECT' },
    relationships: {},
    sensitivity: 'INTERNAL',
    createdAt: iso(0),
    updatedAt: iso(0),
    ...fields,
  };
}

function candidate(action, fields) {
  return {
    schemaVersion: '1.0.0',
    action,
    evidence: [],
    proposedBy: 'failure-test-agent',
    requiresOwnerApproval: false,
    timestamp: iso(0),
    ...fields,
  };
}

async function remember(record, authorityLevel, reason) {
  const path = await input(record.id, candidate('CREATE', { proposedRecord: record, authorityLevel, reason }));
  return tamhees('memory', 'apply', '--input', path);
}

async function audit() {
  // `tamhees audit` prints a report and appends privacy-safe events to the audit log.
  const result = await tamhees('audit');
  const events = (await readFile(join(project, '.tamhees', 'audits', 'history.jsonl'), 'utf8'))
    .trim().split('\n').map((line) => JSON.parse(line));
  return { result, events };
}

function latestFinding(events, memoryId) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.memoryId === memoryId) return event;
  }
  return undefined;
}

async function context(task) {
  const result = await tamhees('context', '--task', task, '--format', 'json');
  return JSON.parse(result.stdout);
}

async function storageText() {
  const parts = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else parts.push(await readFile(path, 'utf8'));
    }
  }
  await walk(join(project, '.tamhees'));
  return parts.join('\n');
}

function excludedReason(pack, id) {
  return pack.excluded.find((item) => item.memoryId === id)?.reason;
}
function selected(pack, id) {
  return pack.selected.find((item) => item.memoryId === id);
}

try {
  project = await mkdtemp(join(tmpdir(), 'tamhees-failure-test-'));
  heading('Setup');
  const init = await tamhees('init', '.');
  check('Initialized a fresh .tamhees/ store', init.code === 0, project);

  // ───────────────────────────────────────────────────────────────────────────
  heading('1. Contradictory facts — "Use SQLite" meets a Supabase repository');
  const db = memory('DM-MEM-DB-001', {
    kind: 'DECISION',
    statement: 'The project uses SQLite for database persistence.',
    source: { type: 'REPOSITORY_STATE', reference: 'package.json (earlier session)' },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: { lastVerified: iso(-20) },
    actionPermission: 'ACT_WITH_CAUTION',
    tags: ['database', 'persistence', 'sqlite', 'migration'],
    recheckMethod: 'Inspect package.json and database configuration.',
  });
  const created = await remember(db, 'REPO_VERIFIED', 'Remember the database observed earlier.');
  check('Memory stored with source, confidence, freshness and scope', created.code === 0);
  say(`Remembered: "${db.statement}" (HIGH confidence, verified 20 days ago)`);

  const evidencePath = await input('evidence-supabase', {
    schemaVersion: '1.0.0',
    id: 'DM-EVIDENCE-DB-001',
    type: 'REPOSITORY_STATE',
    source: 'package.json',
    content: 'package.json now depends on the Supabase client; no SQLite driver is installed.',
    relationship: 'CONTRADICTS',
    memoryIds: [db.id],
    collectedAt: iso(0),
    collectedBy: 'failure-test-agent',
  });
  const added = await tamhees('evidence', 'add', '--input', evidencePath);
  check('Current repository evidence recorded as CONTRADICTS', added.code === 0);

  let { events } = await audit();
  let finding = latestFinding(events, db.id);
  check('Audit blocks the action', finding?.outcome === 'BLOCK_ACTION', `${finding?.outcome} via ${finding?.triggeredRules?.join(", ")}`);
  say(`Why: ${finding?.explanation ?? "(no explanation)"}`);
  let pack = await context('prepare the database migration');
  check('Conflicted memory is withheld from the agent context', selected(pack, db.id) === undefined,
    `excluded as "${excludedReason(pack, db.id)}"`);
  summary.push(['Contradictory facts', finding?.outcome, 'withheld from context']);

  // ───────────────────────────────────────────────────────────────────────────
  heading('2. Stale data — a build instruction past its expiry date');
  const build = memory('DM-MEM-BUILD-001', {
    kind: 'CONVENTION',
    statement: 'Release builds use the legacy build script.',
    source: { type: 'REPOSITORY_STATE', reference: 'scripts/ (earlier session)' },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: { lastVerified: iso(-200), reviewAfter: iso(-110), expiresAfter: iso(-20) },
    actionPermission: 'ACT_WITH_CAUTION',
    tags: ['build', 'release'],
    recheckMethod: 'Inspect package.json scripts and the release checklist.',
  });
  check('Old memory stored', (await remember(build, 'REPO_VERIFIED', 'Remember the old build step.')).code === 0);
  say(`Remembered: "${build.statement}" (last verified 200 days ago, expired 20 days ago)`);
  ({ events } = await audit());
  finding = latestFinding(events, build.id);
  check('Audit asks for re-verification instead of trusting it', finding?.outcome === 'RECHECK',
    `${finding?.outcome} via ${finding?.triggeredRules?.join(", ")}`);
  say(`Why: ${finding?.explanation ?? "(no explanation)"}`);
  pack = await context('run the release build');
  check('Expired memory is withheld from the agent context', selected(pack, build.id) === undefined,
    `excluded as "${excludedReason(pack, build.id)}"`);
  summary.push(['Stale data', finding?.outcome, 'withheld from context']);

  // ───────────────────────────────────────────────────────────────────────────
  heading('3. "I might be wrong" — a confident AI guess is not owner approval');
  const guess = memory('DM-MEM-UI-001', {
    kind: 'PREFERENCE',
    statement: 'The owner prefers purple interfaces for every product.',
    source: { type: 'AGENT_INFERENCE', reference: 'design discussion summary', agent: 'failure-test-agent' },
    verificationStatus: 'INFERRED',
    confidence: 'HIGH',
    freshness: { lastVerified: iso(-2) },
    actionPermission: 'ASK_BEFORE_CHANGE',
    tags: ['design', 'interface', 'color'],
    recheckMethod: 'Ask the owner to confirm the interface color preference.',
  });
  check('AI inference stored (as INFERRED, never OWNER_CONFIRMED)',
    (await remember(guess, 'INFERRED', 'Record an inferred design preference.')).code === 0);
  ({ events } = await audit());
  finding = latestFinding(events, guess.id);
  check('Audit says: ask the owner before acting', finding?.outcome === 'ASK_OWNER',
    `${finding?.outcome} via ${finding?.triggeredRules?.join(", ")}`);
  say(`Why: ${finding?.explanation ?? "(no explanation)"}`);
  pack = await context('redesign the interface color theme');
  const shown = selected(pack, guess.id);
  check('Agent still sees it, labelled as uncertain', shown?.auditOutcome === 'ASK_OWNER',
    shown ? `selected with outcome ${shown.auditOutcome}, status ${shown.verificationStatus}, confidence ${shown.confidence}` : 'not selected');
  summary.push(['AI guess (might be wrong)', finding?.outcome, 'shown with uncertainty label']);

  // ───────────────────────────────────────────────────────────────────────────
  heading('4. Privacy revocation — the user says "forget that"');
  const personal = memory('DM-MEM-PERSONAL-001', {
    kind: 'OBSERVATION',
    statement: 'The owner usually works from the Al Barsha home office on Sundays.',
    source: { type: 'AGENT_OBSERVATION', reference: 'chat session', agent: 'failure-test-agent' },
    verificationStatus: 'OBSERVED',
    confidence: 'MEDIUM',
    freshness: { lastVerified: iso(-1) },
    actionPermission: 'ACT_WITH_CAUTION',
    tags: ['schedule', 'office'],
    recheckMethod: 'Ask the owner.',
  });
  check('Personal observation stored', (await remember(personal, 'OBSERVED', 'Remember a scheduling detail.')).code === 0);
  pack = await context('plan the office schedule');
  check('Before revocation it is available to the agent', selected(pack, personal.id) !== undefined);

  const redactPath = await input('redact-personal', candidate('REDACT', {
    memoryId: personal.id,
    authorityLevel: 'OBSERVED',
    reason: 'Owner revoked consent to remember this personal detail.',
  }));
  const redacted = await tamhees('memory', 'apply', '--input', redactPath);
  check('REDACT accepted', redacted.code === 0);
  const afterText = await storageText();
  check('Raw personal text no longer exists anywhere in .tamhees/ (records, archive, audit log)',
    !afterText.includes('Al Barsha'));
  check('A safe tombstone keeps the audit trail', afterText.includes(personal.id));
  pack = await context('plan the office schedule');
  check('After revocation it never reaches the agent', selected(pack, personal.id) === undefined,
    `excluded as "${excludedReason(pack, personal.id)}"`);
  ({ events } = await audit());
  finding = latestFinding(events, personal.id);
  summary.push(['Privacy revocation', finding?.outcome ?? 'FORGET_OR_REDACT', 'raw text erased, tombstone kept']);

  // ───────────────────────────────────────────────────────────────────────────
  heading('5. Unsafe write — a secret-like value never gets stored');
  const fakeKey = ['api', 'key=sk', 'test', 'FAKE0000000000000000000000'].join('_');
  const secret = memory('DM-MEM-SECRET-001', {
    kind: 'OBSERVATION',
    statement: `Use ${fakeKey} for the payments sandbox.`,
    source: { type: 'AGENT_OBSERVATION', reference: 'chat session', agent: 'failure-test-agent' },
    verificationStatus: 'OBSERVED',
    confidence: 'HIGH',
    freshness: { lastVerified: iso(0) },
    actionPermission: 'ACT_WITH_CAUTION',
    tags: ['payments'],
    recheckMethod: 'Ask the owner.',
  });
  const refused = await remember(secret, 'OBSERVED', 'Remember a credential.');
  check('Write path refuses the credential-shaped memory', refused.code !== 0,
    (refused.stderr || refused.stdout).trim().split('\n')[0]);
  check('Nothing about it was persisted', !(await storageText()).includes('FAKE0000'));
  summary.push(['Secret-like value', 'REFUSED AT WRITE', 'never stored']);

  // ───────────────────────────────────────────────────────────────────────────
  heading('6. Self-detection — nobody reports the change; Tamhees notices it');
  await writeFile(join(project, 'package.json'), `${JSON.stringify({
    name: 'demo', scripts: { test: 'vitest run' }, devDependencies: { vitest: '^2.0.0' },
  }, null, 2)}\n`);
  say('The repository now runs its tests with Vitest. No agent supplies any evidence.');
  const told = await tamhees('remember', 'Unit tests run with Jest', '--as', 'repo', '--source', 'package.json', '--tags', 'testing');
  check('Old memory stored: "Unit tests run with Jest"', told.code === 0, told.stderr.trim());
  const jestId = /Remembered (DM-MEM-\d{6})/.exec(told.stdout)?.[1];
  const observed = await tamhees('observe', '--record', '--format', 'json');
  const result = JSON.parse(observed.stdout || '{}');
  const contradiction = result.report?.observations?.find((item) => item.memoryId === jestId && item.relationship === 'CONTRADICTS');
  check('tamhees observe finds the contradiction by itself', contradiction !== undefined, contradiction?.explanation);
  ({ events } = await audit());
  finding = latestFinding(events, jestId);
  check('Audit now blocks the stale memory', finding?.outcome === 'BLOCK_ACTION',
    `${finding?.outcome} via ${finding?.triggeredRules?.join(", ")}`);
  pack = await context('run the unit tests');
  check('Agent no longer receives it', selected(pack, jestId) === undefined, `excluded as "${excludedReason(pack, jestId)}"`);
  summary.push(['Self-detected change', finding?.outcome, 'found without any reported evidence']);

  heading('Summary');
  for (const [name, outcome, effect] of summary) {
    console.log(`  ${name.padEnd(28)} ${String(outcome).padEnd(18)} ${effect}`);
  }
} catch (error) {
  failures.push(String(error?.stack ?? error));
  console.error(error);
} finally {
  if (project && !keep) await rm(project, { recursive: true, force: true });
  if (project && keep) console.log(`\nProject kept for inspection: ${project}`);
}

if (failures.length > 0) {
  console.log(`\nFAILURE TEST FAILED (${failures.length} check(s)):`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nAll failure-handling checks passed.');
