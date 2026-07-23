'use strict';

const state = {
  scenarios: [],
  selectedId: 'architecture-conflict',
  running: false,
};

const elements = {
  heroRun: document.querySelector('#hero-run'),
  scenarioList: document.querySelector('#scenario-list'),
  scenarioCount: document.querySelector('#scenario-count'),
  concept: document.querySelector('#scenario-concept'),
  title: document.querySelector('#scenario-title'),
  summary: document.querySelector('#scenario-summary'),
  budget: document.querySelector('#budget-input'),
  budgetOutput: document.querySelector('#budget-output'),
  run: document.querySelector('#run-audit'),
  reset: document.querySelector('#reset-audit'),
  progress: document.querySelector('#audit-progress'),
  result: document.querySelector('#audit-result'),
  announcement: document.querySelector('#result-announcement'),
  benchmarkBody: document.querySelector('#benchmark-body'),
  benchmarkNote: document.querySelector('#benchmark-note'),
  methodology: document.querySelector('#benchmark-methodology'),
  metricOutcome: document.querySelector('#metric-outcome'),
  metricPrecision: document.querySelector('#metric-precision'),
  metricExposure: document.querySelector('#metric-exposure'),
  metricBudget: document.querySelector('#metric-budget'),
};

void initialize();

async function initialize() {
  bindControls();
  try {
    const [scenarioResponse, benchmarkResponse] = await Promise.all([
      getJson('/api/scenarios'),
      getJson('/api/benchmark'),
    ]);
    state.scenarios = scenarioResponse.scenarios;
    renderScenarioList();
    selectScenario(state.selectedId);
    renderBenchmark(benchmarkResponse.benchmark);
  } catch {
    showStartupError();
  }
}

function bindControls() {
  elements.run.addEventListener('click', () => void runAudit());
  elements.reset.addEventListener('click', resetAudit);
  elements.heroRun.addEventListener('click', () => {
    selectScenario('architecture-conflict');
    document.querySelector('#live-audit').scrollIntoView({ block: 'start' });
    void runAudit();
  });
  elements.budget.addEventListener('input', () => {
    elements.budgetOutput.textContent = elements.budget.value;
  });
}

function renderScenarioList() {
  elements.scenarioList.replaceChildren();
  elements.scenarioCount.textContent = String(state.scenarios.length).padStart(2, '0');
  state.scenarios.forEach((scenario, index) => {
    const button = el('button', 'scenario-button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(scenario.id === state.selectedId));
    button.dataset.scenarioId = scenario.id;
    button.append(
      textEl('span', 'scenario-index', String(index + 1).padStart(2, '0')),
      textEl('strong', '', scenario.shortTitle),
      textEl('small', '', scenario.expectedOutcome),
    );
    button.addEventListener('click', () => selectScenario(scenario.id));
    elements.scenarioList.append(button);
  });
}

function selectScenario(scenarioId) {
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) return;
  state.selectedId = scenario.id;
  elements.concept.textContent = scenario.concept.toUpperCase();
  elements.title.textContent = scenario.title;
  elements.summary.textContent = scenario.summary;
  elements.budget.value = String(scenario.defaultMaxTokens);
  elements.budgetOutput.textContent = String(scenario.defaultMaxTokens);
  for (const button of elements.scenarioList.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.scenarioId === scenario.id));
  }
  resetAudit(false);
}

async function runAudit() {
  if (state.running) return;
  state.running = true;
  elements.run.disabled = true;
  elements.result.setAttribute('aria-busy', 'true');
  elements.progress.hidden = false;
  elements.result.className = 'result-placeholder';
  elements.result.replaceChildren(
    textEl('span', 'placeholder-mark', '…'),
    textEl('h4', '', 'Auditing canonical memory'),
    textEl('p', '', 'Checking provenance, current evidence, authority, privacy, freshness, and context budget.'),
  );
  try {
    const result = await getJson('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId: state.selectedId,
        maxTokens: Number(elements.budget.value),
      }),
    });
    renderResult(result);
    elements.announcement.textContent =
      `Audit complete: ${result.outcome}. Focus moved to the result.`;
    elements.result.focus();
  } catch {
    renderRequestError();
  } finally {
    state.running = false;
    elements.run.disabled = false;
    elements.result.setAttribute('aria-busy', 'false');
    elements.progress.hidden = true;
  }
}

function resetAudit(restoreFocus = true) {
  elements.result.className = 'result-placeholder';
  elements.result.replaceChildren(
    textEl('span', 'placeholder-mark', '?'),
    textEl('h4', '', 'Ready to audit'),
    textEl('p', '', 'Run the scenario to see the engine outcome, evidence trace, action consequence, and budgeted context.'),
  );
  elements.announcement.textContent = restoreFocus ? 'Scenario reset.' : '';
  elements.progress.hidden = true;
  if (restoreFocus) elements.run.focus();
}

function renderResult(result) {
  elements.result.className = 'result-view';
  elements.result.replaceChildren();

  const outcome = el('section', 'outcome-panel');
  outcome.dataset.outcome = result.outcome;
  outcome.setAttribute('aria-label', `Audit outcome: ${result.outcome}`);
  const outcomeText = el('div');
  outcomeText.append(
    textEl('h4', '', `${outcomeSymbol(result.outcome)} ${result.outcome}`),
    textEl('p', '', result.explanation),
  );
  outcome.append(textEl('span', 'outcome-icon', outcomeSymbol(result.outcome)), outcomeText);

  const resultGrid = el('div', 'result-grid');
  resultGrid.append(
    detailCard('Action permission consequence', result.permissionConsequence),
    detailCard('Recommended next step', result.recommendedNextStep),
    memoriesCard(result.memories),
    evidenceCard(result.evidence, result.evidenceConsidered),
    traceCard(result.ruleTrace),
    contextCard(result.context),
  );

  elements.result.append(
    outcome,
    resultGrid,
    textEl('p', 'fixture-note', result.fixtureDisclaimer),
  );
}

function detailCard(title, content) {
  const card = el('section', 'result-card');
  card.append(textEl('h5', '', title), textEl('p', '', content));
  return card;
}

function memoriesCard(memories) {
  const card = el('section', 'result-card');
  card.append(textEl('h5', '', 'Remembered claims'));
  const list = el('ul', 'data-list');
  for (const memory of memories) {
    const item = el('li');
    item.append(
      textEl('code', '', memory.id),
      textEl('p', '', memory.statement),
      textEl(
        'span',
        'meta-line',
        `${memory.verificationStatus} · ${memory.confidence} confidence · ${memory.actionPermission} · ${memory.sensitivity}`,
      ),
    );
    list.append(item);
  }
  card.append(list);
  return card;
}

function evidenceCard(evidence, consideredIds) {
  const card = el('section', 'result-card');
  card.append(textEl('h5', '', 'Evidence considered'));
  const list = el('ul', 'data-list');
  if (evidence.length === 0) {
    list.append(textEl('li', 'empty-state', 'No evidence record is needed for the privacy-first rule.'));
  }
  for (const item of evidence) {
    const row = el('li');
    const considered = consideredIds.includes(item.id) ? 'EXAMINED' : 'AVAILABLE';
    row.append(
      textEl('code', '', item.id),
      textEl('p', '', item.summary),
      textEl('span', 'meta-line', `${considered} · ${item.type} · ${item.relationship}`),
    );
    list.append(row);
  }
  card.append(list);
  return card;
}

function traceCard(trace) {
  const card = el('section', 'result-card');
  card.append(textEl('h5', '', 'Triggered rule trace'));
  const list = el('ol', 'trace-list');
  for (const rule of trace) {
    const item = el('li');
    item.append(textEl('code', '', rule.id), textEl('p', '', rule.description));
    list.append(item);
  }
  card.append(list);
  return card;
}

function contextCard(context) {
  const card = el('section', 'context-card');
  card.append(textEl('h5', '', 'Ephemeral task context'));
  const budget = el('div', 'budget-summary');
  const progress = el('progress');
  progress.max = context.budget.maxTokens;
  progress.value = context.budget.estimatedTokensUsed;
  progress.setAttribute(
    'aria-label',
    `${context.budget.estimatedTokensUsed} of ${context.budget.maxTokens} estimated tokens used`,
  );
  budget.append(
    textEl('span', '', `${context.budget.estimatedTokensUsed} used`),
    progress,
    textEl('span', '', `${context.budget.estimatedTokensRemaining} remaining`),
  );
  card.append(budget);

  const columns = el('div', 'context-columns');
  columns.append(
    contextList('Selected context', context.selected, true),
    contextList('Excluded context', context.excluded, false),
  );
  card.append(columns);
  return card;
}

function contextList(title, items, selected) {
  const region = el('div');
  region.append(textEl('h5', '', title));
  const list = el('ul', 'context-list');
  if (items.length === 0) {
    list.append(textEl('li', 'empty-state', selected
      ? 'No record passed every safety, relevance, and budget gate.'
      : 'No record was excluded.'));
  }
  for (const item of items) {
    const row = el('li');
    row.append(textEl('code', '', selected ? item.memoryId : `${item.memoryId} · ${item.reasonCode}`));
    row.append(textEl('p', '', selected ? item.statement : item.reason));
    if (selected) {
      row.append(textEl(
        'span',
        'meta-line',
        `rank ${item.rank} · score ${item.ranking.totalScore} · ${item.estimatedTokens} estimated tokens`,
      ));
    }
    list.append(row);
  }
  region.append(list);
  return region;
}

function renderBenchmark(benchmark) {
  const doubtfulMemory = benchmark.configurations.find((item) => item.name === 'DOUBTFUL_MEMORY');
  if (doubtfulMemory) {
    elements.metricOutcome.textContent = fractionText(doubtfulMemory.outcomeCorrectness);
    elements.metricPrecision.textContent = fractionText(doubtfulMemory.retrievalMicro.precision);
    elements.metricExposure.textContent = doubtfulMemory.unsafeExposureCount + ' / ' + doubtfulMemory.secretLeakageCount;
    elements.metricBudget.textContent = fractionText(doubtfulMemory.budgetCompliance);
  }
  elements.benchmarkBody.replaceChildren();
  for (const configuration of benchmark.configurations) {
    const row = el('tr');
    row.dataset.configuration = configuration.name;
    row.append(
      textEl('td', '', configurationLabel(configuration.name)),
      textEl('td', '', ratioText(configuration.retrievalMicro.precision)),
      textEl('td', '', ratioText(configuration.retrievalMicro.recall)),
      textEl('td', '', ratioText(configuration.abstentionCorrectness)),
      textEl('td', '', ratioText(configuration.budgetCompliance)),
      textEl('td', '', ratioText(configuration.outcomeCorrectness)),
      textEl('td', '', `${configuration.unsafeExposureCount} / ${configuration.secretLeakageCount}`),
    );
    elements.benchmarkBody.append(row);
  }
  elements.benchmarkNote.textContent =
    `${benchmark.limitation} Artifact SHA-256: ${benchmark.artifactSha256}.`;
  elements.methodology.replaceChildren(
    textEl('p', '', benchmark.methodology.groundTruthPolicy),
    textEl('p', '', benchmark.methodology.safetyAdjustedRecallPolicy),
    textEl('p', '', benchmark.methodology.undefinedMetricPolicy),
    textEl('p', '', benchmark.methodology.noMemoryPolicy),
    textEl('p', '', `${benchmark.scenarioCount} fixed scenarios; generated ${benchmark.generatedAt}.`),
  );
}

function fractionText(ratio) {
  return ratio.numerator + '/' + ratio.denominator;
}

function ratioText(ratio) {
  if (ratio.value === null) return `N/A (${ratio.numerator}/${ratio.denominator})`;
  const percentage = (ratio.value * 100).toFixed(ratio.value === 0 || ratio.value === 1 ? 0 : 1);
  return `${ratio.numerator}/${ratio.denominator} · ${percentage}%`;
}

function configurationLabel(value) {
  const labels = {
    NO_MEMORY: 'No memory',
    MONOLITHIC_GPTBRAIN: 'Monolithic GPTBrain',
    SIMPLE_SPLIT_FILES: 'Simple split files',
    DOUBTFUL_MEMORY: 'Doubtful Memory',
  };
  return labels[value] || value;
}

function outcomeSymbol(outcome) {
  const symbols = {
    TRUST: '✓',
    RECHECK: '↻',
    ASK_OWNER: '?',
    BLOCK_ACTION: '⊘',
    FORGET_OR_REDACT: '⌫',
  };
  return symbols[outcome] || '!';
}

function renderRequestError() {
  elements.result.className = 'result-placeholder';
  elements.result.replaceChildren(
    textEl('span', 'placeholder-mark', '!'),
    textEl('h4', '', 'The local audit could not complete'),
    textEl('p', '', 'Retry the scenario. If the problem continues, restart the local dashboard command.'),
  );
  elements.announcement.textContent = 'The local audit could not complete. Retry or restart the dashboard.';
  elements.result.focus();
}

function showStartupError() {
  elements.scenarioList.replaceChildren(
    textEl('p', 'empty-state', 'Local scenario metadata is unavailable. Restart the dashboard.'),
  );
  elements.benchmarkBody.replaceChildren();
  const row = el('tr');
  const cell = textEl('td', '', 'The local benchmark artifact could not be loaded.');
  cell.colSpan = 7;
  row.append(cell);
  elements.benchmarkBody.append(row);
}

async function getJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error('Local dashboard request failed.');
  return data;
}

function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function textEl(tag, className, text) {
  const node = el(tag, className);
  node.textContent = text;
  return node;
}
