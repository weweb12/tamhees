import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileContext } from '../src/core/context.js';
import { buildRememberCandidate } from '../src/core/quick.js';
import { fixedClock, type MemoryRecord } from '../src/core/types.js';
import { validateContextPack } from '../src/core/validation.js';

const NOW = '2026-10-25T09:00:00.000Z';
const clock = fixedClock(NOW);

function memory(id: string, statement: string, tags: string[] = []): MemoryRecord {
  return buildRememberCandidate({ statement, basis: 'repo', sourceReference: 'package.json', id, tags }, [], NOW).proposedRecord!;
}

function served(task: string, record: MemoryRecord): boolean {
  const pack = compileContext(task, [record], clock, []);
  assert.equal(validateContextPack(pack).valid, true);
  return pack.selected.some((item) => item.memoryId === record.id);
}

describe('Concept matching: equivalent terms find each other', () => {
  const cases: Array<[string, string, string[]]> = [
    ['set up Postgres replicas', 'Connection limits are tuned for production.', ['database']],
    ['add a db index', 'Database indexes are reviewed before release.', []],
    ['write the migrations', 'Every migration needs a rollback script.', []],
    ['fix the failing tests', 'The suite runs with Vitest in watch mode.', ['vitest']],
    ['harden auth', 'Authentication tokens expire after one hour.', []],
    ['update the config', 'Configuration lives in one typed module.', []],
    ['change the PostgreSQL pool', 'Postgres pool size is twenty.', []],
    ['improve the deploy script', 'Deployment runs only from the main branch.', []],
  ];
  for (const [task, statement, tags] of cases) {
    it(`"${task}" retrieves "${statement}"`, () => {
      assert.equal(served(task, memory('DM-MEM-000001', statement, tags)), true);
    });
  }
});

describe('Concept matching: stays conservative', () => {
  it('sibling technologies never match each other', () => {
    assert.equal(served('tune MySQL', memory('DM-MEM-000001', 'Postgres is the primary store.', ['postgres'])), false);
    assert.equal(served('switch to Jest', memory('DM-MEM-000002', 'Vitest runs the unit suite.', ['vitest'])), false);
    assert.equal(served('migrate Vue components', memory('DM-MEM-000003', 'React renders the storefront.', ['react'])), false);
  });

  it('general terms find specific memories, and specific terms find general ones', () => {
    assert.equal(served('database backup plan', memory('DM-MEM-000001', 'Supabase handles nightly snapshots.', ['supabase'])), true);
    assert.equal(served('upgrade Supabase', memory('DM-MEM-000002', 'Database credentials rotate monthly.', ['database'])), true);
  });

  it('substrings and common words are still not matches', () => {
    assert.equal(served('update the data model', memory('DM-MEM-000001', 'Database schema is versioned.', [])), false);
    assert.equal(served('use the project', memory('DM-MEM-000002', 'The project uses npm.', [])), false);
  });

  it('plural folding does not mangle short or -ss/-us words', () => {
    assert.equal(served('fix css bus class', memory('DM-MEM-000001', 'The status class is reused.', [])), true, 'class/class');
    assert.equal(served('check the status', memory('DM-MEM-000002', 'Statu flags are cached.', [])), false, 'status is not plural of statu');
  });
});

describe('Retrieval ignores generic task words', () => {
  it('filler verbs and nouns no longer pull in unrelated memories', () => {
    assert.equal(served('Add a button to the header', memory('DM-MEM-000001', 'Add new tests next to the source file.', ['testing'])), false);
    assert.equal(served('Fix the bug in the login form', memory('DM-MEM-000002', 'Fix lint warnings before opening a pull request.', ['conventions'])), false);
    assert.equal(served('Create a new file for the cart', memory('DM-MEM-000003', 'Every new file needs a license header.', [])), false);
  });

  it('everyday product words reach the right area', () => {
    assert.equal(served('Add a button to the checkout page', memory('DM-MEM-000001', 'Stripe webhooks must be idempotent.', ['payments'])), true);
    assert.equal(served('Validate the signup form', memory('DM-MEM-000002', 'Passwords are hashed with argon2id.', ['authentication'])), true);
    assert.equal(served('Make the endpoint paginate results', memory('DM-MEM-000003', 'Pagination uses cursors, not offsets.', ['api'])), true);
  });
});

