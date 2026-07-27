import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import {
  DASHBOARD_BENCHMARK_SHA256,
  DASHBOARD_BENCHMARK_RELATIVE_PATH,
  loadDashboardBenchmark,
} from '../src/dashboard/benchmark.js';
import {
  DASHBOARD_SCENARIO_IDS,
  listDashboardScenarios,
  runDashboardScenario,
} from '../src/dashboard/scenarios.js';
import {
  DASHBOARD_HOST,
  DASHBOARD_MAX_BODY_BYTES,
  startDashboardServer,
  type RunningDashboard,
} from '../src/dashboard/server.js';

const REPOSITORY_ROOT = resolve('.');
let dashboard: RunningDashboard;

interface HttpResult {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

before(async () => {
  dashboard = await startDashboardServer({ port: 0, rootDir: REPOSITORY_ROOT });
});

after(async () => {
  await dashboard.close();
});

describe('Phase 8 canonical dashboard scenarios', () => {
  test('executes every representative scenario through canonical deterministic rules', () => {
    const expected = new Map([
      ['architecture-conflict', 'BLOCK_ACTION'],
      ['stale-memory', 'RECHECK'],
      ['revoked-memory', 'BLOCK_ACTION'],
      ['agent-inference', 'ASK_OWNER'],
      ['secret-redaction', 'FORGET_OR_REDACT'],
      ['context-budget', 'TRUST'],
      ['supported-current-fact', 'TRUST'],
    ]);
    const summaries = listDashboardScenarios();
    assert.deepEqual(summaries.map((item) => item.id), DASHBOARD_SCENARIO_IDS);
    for (const summary of summaries) {
      const result = runDashboardScenario(summary.id);
      assert.equal(result.outcome, expected.get(summary.id));
      assert.equal(result.outcome, summary.expectedOutcome);
      assert.ok(result.triggeredRuleIds.every((id) => id.startsWith('DM-RULE-')));
      assert.ok(result.explanation.length > 10);
      assert.ok(result.permissionConsequence.length > 10);
      assert.ok(result.recommendedNextStep.length > 10);
      assert.equal(result.context.budget.compliant, true);
    }
  });

  test('redacts the fake secret before dashboard output', () => {
    const serialized = JSON.stringify(runDashboardScenario('secret-redaction'));
    assert.doesNotMatch(serialized, /dm_fake_key_DO_NOT_USE_123456789/);
    assert.match(serialized, /\[REDACTED/);
    assert.match(serialized, /FORGET_OR_REDACT/);
    assert.match(serialized, /redacted/);
  });

  test('applies a hard budget to whole relevant records and explains exclusions', () => {
    const result = runDashboardScenario('context-budget');
    assert.equal(result.context.selected.length, 1);
    assert.equal(result.context.budget.maxTokens, 110);
    assert.ok(result.context.budget.estimatedTokensUsed <= 110);
    assert.equal(result.context.excluded.filter((item) => item.reasonCode === 'over-budget').length, 2);
    assert.equal(result.context.excluded.filter((item) => item.reasonCode === 'irrelevant').length, 1);
  });

  test('returns byte-equivalent results for the same scenario and budget', () => {
    const first = JSON.stringify(runDashboardScenario('context-budget', 180));
    const second = JSON.stringify(runDashboardScenario('context-budget', 180));
    assert.equal(first, second);
  });
});

describe('Phase 8 local API and security boundary', () => {
  test('binds only to loopback and serves the opening page and local assets', async () => {
    assert.equal(dashboard.host, DASHBOARD_HOST);
    assert.match(dashboard.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await httpCall('/');
    const css = await httpCall('/assets/dashboard.css');
    const script = await httpCall('/assets/dashboard.js');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Memory under scrutiny\./);
    assert.equal(css.statusCode, 200);
    assert.match(headerText(css.headers['content-type']), /text\/css/);
    assert.equal(script.statusCode, 200);
    assert.match(headerText(script.headers['content-type']), /text\/javascript/);
  });

  test('returns strict scenario metadata and real scenario result schemas', async () => {
    const scenarios = await httpCall('/api/scenarios');
    assert.equal(scenarios.statusCode, 200);
    const scenarioBody = JSON.parse(scenarios.body) as {
      schemaVersion: string;
      scenarios: readonly { id: string }[];
    };
    assert.equal(scenarioBody.schemaVersion, '1.0.0');
    assert.deepEqual(scenarioBody.scenarios.map((item) => item.id), DASHBOARD_SCENARIO_IDS);

    const audit = await httpCall('/api/audit', {
      method: 'POST',
      body: JSON.stringify({ scenarioId: 'architecture-conflict', maxTokens: 140 }),
    });
    assert.equal(audit.statusCode, 200);
    const result = JSON.parse(audit.body) as ReturnType<typeof runDashboardScenario>;
    assert.equal(result.outcome, 'BLOCK_ACTION');
    assert.equal(result.context.budget.maxTokens, 140);
    assert.deepEqual(result.triggeredRuleIds, ['DM-RULE-CONFLICT-001']);
  });

  test('returns byte-equivalent API results for repeated deterministic requests', async () => {
    const options = {
      method: 'POST',
      body: JSON.stringify({ scenarioId: 'context-budget', maxTokens: 180 }),
    } as const;
    const first = await httpCall('/api/audit', options);
    const second = await httpCall('/api/audit', options);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body, first.body);
  });

  test('rejects malformed, duplicate, unknown, invalid, unsupported, empty, and oversized bodies', async () => {
    const invalidBodies = [
      '{',
      JSON.stringify({ scenarioId: 'stale-memory', unexpected: true }),
      '{"scenarioId":"stale-memory","scenarioId":"architecture-conflict"}',
      '{"scenarioId":"stale-memory","scenario\\u0049d":"architecture-conflict"}',
      JSON.stringify({ scenarioId: 'not-a-scenario' }),
      JSON.stringify({ scenarioId: 'stale-memory', maxTokens: 0 }),
      JSON.stringify({ scenarioId: 'stale-memory', maxTokens: 1.5 }),
      JSON.stringify({ scenarioId: 'stale-memory', maxTokens: '40' }),
      JSON.stringify({ scenarioId: 'stale-memory', maxTokens: 1_000_001 }),
    ];
    for (const body of invalidBodies) {
      assert.equal((await httpCall('/api/audit', { method: 'POST', body })).statusCode, 400);
    }

    assert.equal((await httpCall('/api/audit', {
      method: 'POST',
      contentType: 'text/plain',
      body: '{}',
    })).statusCode, 415);
    assert.equal((await httpCall('/api/audit', {
      method: 'POST',
      contentType: 'application/jsonp',
      body: '{}',
    })).statusCode, 415);
    assert.equal((await httpCall('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })).statusCode, 400);
    assert.equal((await httpCall('/api/audit', {
      method: 'POST',
      body: JSON.stringify({ scenarioId: 'stale-memory', padding: 'x'.repeat(DASHBOARD_MAX_BODY_BYTES) }),
    })).statusCode, 413);
  });

  test('enforces exact routes, methods, request targets, and static allowlisting', async () => {
    const head = await httpCall('/', { method: 'HEAD' });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '');
    assert.equal((await httpCall('/', { method: 'OPTIONS' })).statusCode, 405);
    assert.equal((await httpCall('/api/scenarios', { method: 'HEAD' })).statusCode, 405);
    assert.equal((await httpCall('/api/scenarios', { method: 'POST', body: '{}' })).statusCode, 405);
    assert.equal((await httpCall('/api/audit')).statusCode, 405);
    assert.equal((await httpCall('/api/benchmark', { method: 'POST', body: '{}' })).statusCode, 405);
    assert.equal((await httpCall('/api/not-a-route')).statusCode, 404);
    assert.equal((await httpCall('/?unexpected=1')).statusCode, 400);
    assert.equal((await httpCall('/api/scenarios?unexpected=1')).statusCode, 400);
    assert.equal((await httpCall(`http://${DASHBOARD_HOST}:${dashboard.port}/`)).statusCode, 400);

    for (const path of [
      '/assets/%2e%2e/package.json',
      '/assets/%2Fpackage.json',
      '/assets/%5cpackage.json',
      '/assets/%00package.json',
      '/assets/%zz/package.json',
    ]) {
      assert.equal((await httpCall(path)).statusCode, 400);
    }
    assert.equal((await httpCall('/assets/%252e%252e/package.json')).statusCode, 404);
    assert.equal((await httpCall('/package.json')).statusCode, 404);
  });

  test('rejects host confusion and cross-origin requests while allowing the exact printed origin', async () => {
    assert.equal((await httpCall('/', {
      headers: { Host: 'untrusted.invalid' },
    })).statusCode, 403);
    assert.equal((await httpCall('/api/scenarios', {
      headers: { Origin: 'https://untrusted.invalid' },
    })).statusCode, 403);
    assert.equal((await httpCall('/api/audit', {
      method: 'POST',
      headers: { Origin: `http://${DASHBOARD_HOST}:${dashboard.port + 1}` },
      body: JSON.stringify({ scenarioId: 'stale-memory' }),
    })).statusCode, 403);
    assert.equal((await httpCall('/api/audit', {
      method: 'POST',
      headers: { Origin: `http://${DASHBOARD_HOST}:${dashboard.port}` },
      body: JSON.stringify({ scenarioId: 'stale-memory' }),
    })).statusCode, 200);
  });

  test('survives an interrupted request body and remains available', async () => {
    await interruptAuditRequest();
    assert.equal((await httpCall('/api/scenarios')).statusCode, 200);
  });

  test('returns restrictive security headers without CORS or implementation details', async () => {
    const response = await httpCall('/');
    assert.match(headerText(response.headers['content-security-policy']), /default-src 'none'/);
    assert.match(headerText(response.headers['content-security-policy']), /connect-src 'self'/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['access-control-allow-origin'], undefined);

    const secretShapedId = 'api_key=private-value-that-must-not-echo';
    const error = await httpCall('/api/audit', {
      method: 'POST',
      body: JSON.stringify({ scenarioId: secretShapedId }),
    });
    assert.equal(error.statusCode, 400);
    assert.doesNotMatch(error.body, /private-value|api_key/i);
    assert.doesNotMatch(error.body, /C:\\|stack|Error:/i);
  });
});

describe('Phase 8 benchmark, privacy, and UI contract', () => {
  test('loads the committed benchmark artifact with exact integrity and transparent ratios', async () => {
    const artifact = await readFile(DASHBOARD_BENCHMARK_RELATIVE_PATH);
    assert.equal(createHash('sha256').update(artifact).digest('hex'), DASHBOARD_BENCHMARK_SHA256);
    const benchmark = await loadDashboardBenchmark(REPOSITORY_ROOT);
    assert.equal(benchmark.scenarioCount, 22);
    assert.deepEqual(benchmark.configurations.map((item) => item.name), [
      'NO_MEMORY',
      'MONOLITHIC_GPTBRAIN',
      'SIMPLE_SPLIT_FILES',
      'TAMHEES',
    ]);
    assert.deepEqual(benchmark.configurations[0]?.retrievalMicro.precision, {
      numerator: 0,
      denominator: 0,
      value: null,
    });
    assert.deepEqual(benchmark.configurations[3]?.retrievalMicro.precision, {
      numerator: 15,
      denominator: 15,
      value: 1,
    });
  });

  test('rejects an altered benchmark artifact before parsing or display', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'tamhees-dashboard-benchmark-'));
    const temporaryResults = join(temporaryRoot, 'benchmark', 'results');
    try {
      await mkdir(temporaryResults, { recursive: true });
      const artifact = await readFile(DASHBOARD_BENCHMARK_RELATIVE_PATH);
      await writeFile(join(temporaryResults, 'v0.8.2.json'), Buffer.concat([artifact, Buffer.from(' ')]));
      await assert.rejects(
        loadDashboardBenchmark(temporaryRoot),
        /integrity check failed/,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('serves benchmark data from the same integrity-checked artifact', async () => {
    const response = await httpCall('/api/benchmark');
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      benchmark: Awaited<ReturnType<typeof loadDashboardBenchmark>>;
    };
    assert.equal(body.benchmark.artifactSha256, DASHBOARD_BENCHMARK_SHA256);
    assert.equal(body.benchmark.scenarioCount, 22);
    assert.match(body.benchmark.limitation, /two.*recall misses.*budget/i);
  });

  test('uses valid landmarks, headings, labels, ARIA references, native controls, and responsive contracts', async () => {
    const html = await readFile('src/dashboard/public/index.html', 'utf8');
    const script = await readFile('src/dashboard/public/dashboard.js', 'utf8');
    const css = await readFile('src/dashboard/public/dashboard.css', 'utf8');
    assert.match(html, /<header class="site-header">/);
    assert.match(html, /<main id="main">/);
    assert.match(html, /<footer class="site-footer">/);
    assert.match(html, /<nav aria-label="Primary navigation">/);
    assert.match(html, /<button[^>]+id="run-audit"[^>]+type="button"/);
    assert.match(html, /<label for="budget-input">/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /role="group" aria-labelledby="scenario-label"/);
    assert.match(html, /<details class="mobile-nav">/);
    assert.match(html, /<details class="benchmark-details">/);
    assert.doesNotMatch(html, /<button\b[^>]*\brole=/i);
    assert.doesNotMatch(html, /<button\b[^>]*>\s*<\/button>/i);
    assert.doesNotMatch(script, /setAttribute\(['"]role['"],\s*['"]listitem/i);

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((id): id is string => id !== undefined);
    assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique.');
    for (const match of html.matchAll(/(?:aria-labelledby|aria-describedby|for)="([^"]+)"/g)) {
      for (const reference of (match[1] ?? '').split(/\s+/u).filter(Boolean)) {
        assert.ok(ids.includes(reference), `Missing referenced ID: ${reference}`);
      }
    }

    const headingLevels = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
    for (let index = 1; index < headingLevels.length; index += 1) {
      assert.ok(headingLevels[index]! <= headingLevels[index - 1]! + 1, 'Heading levels must not skip.');
    }
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(max-width: 600px\)/);
    assert.match(css, /overflow-x: auto/);
    assert.match(css, /\.benchmark-note\s*\{[^}]*overflow-wrap: anywhere/s);
    assert.match(css, /\.mobile-nav:not\(\[open\]\) > div\s*\{[^}]*display: none/s);
    assert.match(css, /\.mobile-nav\[open\] > div/);
    assert.match(script, /announcement\.textContent = restoreFocus \? 'Example reset\.' : ''/);
  });

  test('implements the owner-directed light visual and explanatory hierarchy without the rejected purple theme', async () => {
    const html = await readFile('src/dashboard/public/index.html', 'utf8');
    const css = await readFile('src/dashboard/public/dashboard.css', 'utf8');
    assert.match(css, /--canvas: #F6F8FB/);
    assert.match(css, /--surface: #FFFFFF/);
    assert.match(css, /--ink: #0A0F16/);
    assert.match(css, /--blue: #2F648F/);
    assert.match(css, /--blue-strong: #1E5B8F/);
    assert.match(css, /--blue-deep: #123A63/);
    assert.match(css, /--blue-soft: #DDEAF4/);
    assert.match(css, /--blue-wash: #F3F7FA/);
    assert.match(css, /--shadow: 0 24px 70px rgba\(18, 58, 99, 0\.12\)/);
    assert.doesNotMatch(css, /purple|violet|#a855f7|#c026d3|#7c3aed|#8b5cf6/i);
    assert.match(html, /Memory under scrutiny\./);
    assert.match(html, /Remembering is useful\. Blind trust is the problem\./);
    assert.match(html, /Before memory controls an action, it must pass four checks\./);
    assert.match(html, /See the safety check before an AI acts\./);
    assert.match(html, /Works beside the coding agent you already use\./);
    assert.match(html, /What Version 1 does—and does not—claim\./);
    assert.match(css, /--content: 1510px/);
    assert.match(css, /font-size: 18px/);
  });

  test('provides an original controllable native hero animation with a reduced-motion final state', async () => {
    const html = await readFile('src/dashboard/public/index.html', 'utf8');
    const script = await readFile('src/dashboard/public/dashboard.js', 'utf8');
    const css = await readFile('src/dashboard/public/dashboard.css', 'utf8');
    assert.match(html, /id="memory-engine-demo"/);
    assert.match(html, /<svg class="engine-connectors"/);
    assert.match(html, /Memory claim · incoming/);
    assert.match(html, /Repository evidence · incoming/);
    assert.match(html, /Source<\/span><strong>PASS/);
    assert.match(html, /Freshness<\/span><strong>WARN · OLD/);
    assert.match(html, /Current evidence<\/span><strong>CONFLICT/);
    assert.match(html, /Permission<\/span><strong>DENY MIGRATION/);
    assert.match(html, /id="hero-motion-toggle"[^>]+aria-pressed="false"/);
    assert.match(html, /id="hero-animation-alt"/);
    assert.match(html, /Ask the owner which database decision is current\./);
    assert.match(html, /Context excluded/);
    assert.match(html, /Unsafe SQLite claim withheld from the task context\./);
    assert.match(script, /IntersectionObserver/);
    assert.match(script, /visibilitychange/);
    assert.match(script, /prefers-reduced-motion: reduce/);
    assert.match(script, /classList\.toggle\('is-paused'/);
    assert.match(css, /grid-template-columns: minmax\(0, 3fr\) minmax\(420px, 2fr\)/);
    assert.match(css, /h1 \{[^}]*max-width: 940px[^}]*clamp\(4\.25rem, 5\.75vw, 6\.65rem\)/s);
    assert.match(css, /\.engine-stage \{[\s\S]*min-height: 36rem/);
    assert.match(css, /animation: pipeline-memory 10s/);
    assert.match(css, /animation: context-exclusion 10s/);
    assert.match(css, /\.engine-demo\.is-page-paused \*/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.engine-demo \.engine-decision/);
    assert.doesNotMatch(html, /yellow outline|red outline|#ffff00|#ff0000/i);
    assert.doesNotMatch(script, /requestAnimationFrame|canvas|getContext|WebGL/i);
  });

  test('implements every guided CLI state, canonical request, control, pause, reset, and static equivalent', async () => {
    const html = await readFile('src/dashboard/public/index.html', 'utf8');
    const script = await readFile('src/dashboard/public/dashboard.js', 'utf8');
    const commands = [
      'tamhees init',
      'tamhees memory apply --input &lt;safe-memory-fixture&gt;',
      'tamhees evidence add --input &lt;safe-evidence-fixture&gt;',
      'tamhees audit',
      'tamhees context --task "prepare the database migration"',
    ];
    for (const command of commands) assert.match(html, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const id of ['cli-run-all', 'cli-next', 'cli-reset', 'cli-motion-toggle', 'cli-step-select']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /role="log" aria-label="Guided CLI output" aria-live="off"/);
    assert.match(html, /Contained CLI demonstration output/);
    assert.match(html, /Read the complete non-animated lesson/);
    assert.match(html, /does not run a shell, accept commands, or write project memory/);
    assert.match(script, /body: JSON\.stringify\(\{ scenarioId: 'architecture-conflict', maxTokens: 240 \}\)/);
    assert.match(script, /Math\.max\(0, Math\.min\(4, index\)\)/);
    assert.match(script, /itemIndex < boundedIndex \? 'complete' : itemIndex === boundedIndex \? 'current' : 'waiting'/);
    assert.match(script, /renderCliStep\(state\.cliStep \+ 1, true\)/);
    assert.match(script, /renderCliStep\(0\)/);
    assert.match(script, /state\.cliOffscreen = !entry\.isIntersecting/);
    assert.match(script, /state\.cliPaused \|\| state\.cliOffscreen \|\| document\.hidden/);
    assert.match(script, /showReducedMotionCliResult/);
    assert.doesNotMatch(script, /child_process|\bexec\s*\(|\bspawn\s*\(|\beval\s*\(|new Function|Function\s*\(/i);
  });
  test('keeps the audit result hidden until execution and presents plain language before collapsed technical detail', async () => {
    const html = await readFile('src/dashboard/public/index.html', 'utf8');
    const script = await readFile('src/dashboard/public/dashboard.js', 'utf8');
    assert.match(html, /<section id="audit-result"[^>]+hidden>/);
    assert.match(html, /The AI remembers/);
    assert.match(html, /The project says now/);
    assert.match(html, /The AI wants to do/);
    assert.match(html, /Check whether the AI may act/);
    assert.match(html, /<details class="technical-details" id="technical-details">/);
    assert.doesNotMatch(html, /<details class="technical-details"[^>]+open/);
    assert.match(script, /resetAudit\(false\)/);
    assert.match(script, /elements\.result\.hidden = true/);
    assert.match(script, /elements\.technicalDetails\.open = false/);
    assert.match(script, /elements\.result\.focus\(\)/);
    assert.match(script, /scenario\.id === 'context-budget'/);
    assert.match(script, /elements\.advanced\.open = isBudgetScenario/);
    assert.match(script, /Blocked — memory and repository evidence disagree\./);
    assert.match(script, /plainCard\('Why', copy\.why\)/);
    assert.match(script, /plainCard\('What the agent is allowed to do', result\.permissionConsequence\)/);
    assert.match(script, /plainCard\('What happens next', result\.recommendedNextStep\)/);
    assert.ok(script.indexOf('elements.resultContext.replaceChildren') < script.indexOf('elements.technicalResult.replaceChildren(resultGrid)'));
    assert.match(html, /id="result-context"[\s\S]*<details class="technical-details"/);
    assert.match(html, /Read the claim[\s\S]*Check its source[\s\S]*Compare current evidence[\s\S]*Check permission[\s\S]*Decide whether action is allowed/);
  });

  test('derives the simplified benchmark comparison from the verified artifact and retains complete methodology', async () => {
    const html = await readFile('src/dashboard/public/index.html', 'utf8');
    const script = await readFile('src/dashboard/public/dashboard.js', 'utf8');
    const benchmark = await loadDashboardBenchmark(REPOSITORY_ROOT);
    assert.match(html, /On 22 controlled fixtures, Tamhees produced the expected safe outcome 22 times\./);
    assert.match(html, /not a claim about every real-world project/);
    for (const configuration of benchmark.configurations) {
      assert.match(html, new RegExp(`data-configuration="${configuration.name}"`));
    }
    assert.deepEqual(benchmark.configurations.map((item) => item.outcomeCorrectness.numerator), [9, 8, 13, 22]);
    assert.match(script, /configuration\.outcomeCorrectness\.numerator/);
    assert.match(html, /View complete benchmark and methodology/);
    assert.match(html, /id="benchmark-body"/);
    assert.match(html, /id="benchmark-methodology"/);
    assert.match(script, /benchmark\.methodology\.undefinedMetricPolicy/);
    assert.match(script, /benchmark\.artifactSha256/);
  });
  test('requires no external resource, browser persistence, or inline executable content', async () => {
    const assets = await Promise.all([
      readFile('src/dashboard/public/index.html', 'utf8'),
      readFile('src/dashboard/public/dashboard.css', 'utf8'),
      readFile('src/dashboard/public/dashboard.js', 'utf8'),
    ]);
    const combined = assets.join('\n');
    assert.doesNotMatch(combined, /(?:src|href)=["']https?:/i);
    assert.doesNotMatch(combined, /@import|url\(\s*["']?https?:/i);
    assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|serviceWorker|document\.cookie/i);
    assert.doesNotMatch(combined, /innerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|Function\s*\(/i);
    assert.doesNotMatch(assets[0]!, /<script(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(assets[0]!, /\sstyle=/i);
  });

  test('does not mutate repository source or persist context while APIs execute', async () => {
    const before = await hashSourceTree();
    assert.equal(await exists(join(REPOSITORY_ROOT, '.tamhees')), false);
    for (const scenarioId of DASHBOARD_SCENARIO_IDS) {
      const response = await httpCall('/api/audit', {
        method: 'POST',
        body: JSON.stringify({ scenarioId }),
      });
      assert.equal(response.statusCode, 200);
    }
    const after = await hashSourceTree();
    assert.equal(after, before);
    assert.equal(await exists(join(REPOSITORY_ROOT, '.tamhees')), false);
  });
});

async function httpCall(
  path: string,
  options: {
    readonly method?: string;
    readonly body?: string;
    readonly contentType?: string;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): Promise<HttpResult> {
  const body = options.body ?? '';
  return new Promise<HttpResult>((resolveResult, reject) => {
    const req = request({
      host: DASHBOARD_HOST,
      port: dashboard.port,
      path,
      method: options.method ?? 'GET',
      headers: {
        ...(body.length > 0 ? {
          'Content-Type': options.contentType ?? 'application/json',
          'Content-Length': Buffer.byteLength(body),
        } : {}),
        ...options.headers,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        resolveResult({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.once('error', reject);
    if (body.length > 0) req.write(body);
    req.end();
  });
}

async function interruptAuditRequest(): Promise<void> {
  await new Promise<void>((resolveRequest, reject) => {
    const socket = createConnection({ host: DASHBOARD_HOST, port: dashboard.port });
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolveRequest();
    };
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') finish();
      else reject(error);
    });
    socket.once('close', finish);
    socket.once('connect', () => {
      const partial = [
        'POST /api/audit HTTP/1.1',
        `Host: ${DASHBOARD_HOST}:${dashboard.port}`,
        'Content-Type: application/json',
        'Content-Length: 1000',
        '',
        '{"scenarioId":"stale-memory"',
      ].join('\r\n');
      socket.write(partial, () => socket.destroy());
    });
  });
}

async function hashSourceTree(): Promise<string> {
  const hash = createHash('sha256');
  const files = await walk(REPOSITORY_ROOT);
  for (const file of files.sort()) {
    hash.update(relative(REPOSITORY_ROOT, file).replaceAll('\\', '/'));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', '.tamhees', 'dist', 'node_modules', 'coverage'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function headerText(value: string | readonly string[] | undefined): string {
  return typeof value === 'string' ? value : value?.join(', ') ?? '';
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
