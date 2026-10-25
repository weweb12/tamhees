'use strict';

document.documentElement.classList.add('motion-ready');

const state = {
  scenarios: [],
  selectedId: 'architecture-conflict',
  running: false,
  progressTimers: [],
  heroPaused: false,
  reducedMotion: false,
  cliStep: 0,
  cliResult: null,
  cliAuto: false,
  cliPaused: false,
  cliOffscreen: false,
  cliTimers: [],
};

const presentation = {
  'architecture-conflict': {
    name: 'Repository changed',
    description: 'A remembered decision conflicts with current files.',
    memory: 'Use SQLite for local persistence.',
    evidence: 'Supabase appears in package metadata and configuration.',
    intent: 'Continue a database-dependent change using the remembered SQLite decision.',
    resultTitle: 'Blocked — memory and repository evidence disagree.',
    why: 'The remembered SQLite decision conflicts with the Supabase configuration currently present in the project.',
    what: 'The coding agent must stop and ask the owner. It cannot silently choose one version.',
  },
  'stale-memory': {
    name: 'Memory became stale',
    description: 'A useful instruction passed its review window.',
    memory: 'Use the legacy packaging command for release builds.',
    evidence: 'The instruction is past its review and expiry dates.',
    intent: 'Prepare the current release using the remembered command.',
    resultTitle: 'Paused — this memory must be checked again.',
    why: 'The remembered build instruction is too old to authorize the current release process.',
    what: 'The coding agent must inspect the current package scripts before continuing.',
  },
  'revoked-memory': {
    name: 'Decision was revoked',
    description: 'A superseded instruction is still visible but no longer active.',
    memory: 'Use the retired deployment workflow.',
    evidence: 'A newer owner instruction supersedes the old workflow.',
    intent: 'Prepare a release using the retired workflow.',
    resultTitle: 'Blocked — the remembered instruction was revoked.',
    why: 'Auditable history is not active permission. The old workflow is explicitly superseded.',
    what: 'The coding agent must use the current instruction and cannot act on the revoked one.',
  },
  'agent-inference': {
    name: 'AI guessed without approval',
    description: 'High confidence is not the same as owner authority.',
    memory: 'The owner prefers purple interfaces for every product.',
    evidence: 'An agent inferred the preference from one earlier mockup.',
    intent: 'Replace the interface design system based on that inference.',
    resultTitle: 'Owner input required — an AI guess is not approval.',
    why: 'The preference came from an agent inference, not an explicit owner decision.',
    what: 'The coding agent must ask the owner before making the material design change.',
  },
  'secret-redaction': {
    name: 'Sensitive value appeared',
    description: 'Credential-shaped content is stopped before context retrieval.',
    memory: 'A conversation included a credential-like value.',
    evidence: 'The value matches a defensive sensitive-data pattern.',
    intent: 'Reuse the conversation as permanent project context.',
    resultTitle: 'Removed — sensitive content must not become memory.',
    why: 'Privacy rules run before relevance or convenience. The unsafe value is withheld.',
    what: 'The coding agent receives only a redacted representation and must forget the raw value.',
  },
  'context-budget': {
    name: 'Context space is limited',
    description: 'Safe relevant memories compete for a hard context budget.',
    memory: 'Several database constraints and observations are relevant.',
    evidence: 'Each record has a different rank and complete estimated size.',
    intent: 'Build a small context pack for a database-adapter change.',
    resultTitle: 'Allowed — the safest relevant context fits the limit.',
    why: 'The engine selected whole safe records in deterministic rank order and excluded records that did not fit.',
    what: 'The coding agent may use the selected pack while the excluded records remain explained and unpersisted.',
  },
  'supported-current-fact': {
    name: 'Current fact is supported',
    description: 'Current test evidence supports limited trust.',
    memory: 'The dashboard binds only to the local loopback interface.',
    evidence: 'The current server test confirms loopback-only binding.',
    intent: 'Start the local dashboard within its recorded permission.',
    resultTitle: 'Allowed — current evidence supports limited trust.',
    why: 'The remembered constraint is current, test-verified, and supported by matching evidence.',
    what: 'The coding agent may proceed only within the recorded local-only permission.',
  },
};

const elements = {
  heroWatch: document.querySelector('#hero-watch'),
  heroDemo: document.querySelector('#memory-engine-demo'),
  heroToggle: document.querySelector('#hero-motion-toggle'),
  heroToggleIcon: document.querySelector('.motion-icon'),
  heroToggleLabel: document.querySelector('.motion-label'),
  scenarioList: document.querySelector('#scenario-list'),
  scenarioCount: document.querySelector('#scenario-count'),
  concept: document.querySelector('#scenario-concept'),
  title: document.querySelector('#scenario-title'),
  summary: document.querySelector('#scenario-summary'),
  inputMemory: document.querySelector('#input-memory'),
  inputEvidence: document.querySelector('#input-evidence'),
  inputIntent: document.querySelector('#input-intent'),
  advanced: document.querySelector('#advanced-context'),
  budget: document.querySelector('#budget-input'),
  budgetOutput: document.querySelector('#budget-output'),
  run: document.querySelector('#run-audit'),
  reset: document.querySelector('#reset-audit'),
  progress: document.querySelector('#audit-progress'),
  ready: document.querySelector('#audit-ready'),
  result: document.querySelector('#audit-result'),
  plainResult: document.querySelector('#plain-result'),
  technicalDetails: document.querySelector('#technical-details'),
  technicalResult: document.querySelector('#technical-result'),
  fixtureNote: document.querySelector('#fixture-note'),
  announcement: document.querySelector('#result-announcement'),
  resultContext: document.querySelector('#result-context'),
  cliShell: document.querySelector('#cli-demo-shell'),
  cliRunAll: document.querySelector('#cli-run-all'),
  cliNext: document.querySelector('#cli-next'),
  cliReset: document.querySelector('#cli-reset'),
  cliToggle: document.querySelector('#cli-motion-toggle'),
  cliToggleLabel: document.querySelector('#cli-motion-toggle span:last-child'),
  cliSelect: document.querySelector('#cli-step-select'),
  cliStatus: document.querySelector('#cli-demo-status'),
  cliProgress: document.querySelector('#cli-demo-progress'),
  cliLog: document.querySelector('#cli-demo-log'),
  lessonStep: document.querySelector('#lesson-step'),
  lessonTitle: document.querySelector('#lesson-title'),
  lessonExplanation: document.querySelector('#lesson-explanation'),
  lessonFacts: document.querySelector('#lesson-facts'),
  cliAnnouncement: document.querySelector('#cli-demo-announcement'),
  benchmarkBody: document.querySelector('#benchmark-body'),
  benchmarkNote: document.querySelector('#benchmark-note'),
  methodology: document.querySelector('#benchmark-methodology'),
  metricPrecision: document.querySelector('#metric-precision'),
  metricUnsafe: document.querySelector('#metric-unsafe'),
  metricSecret: document.querySelector('#metric-secret'),
  inspectorRepoName: document.querySelector('#inspector-repo-name'),
  inspectorRepoFacts: document.querySelector('#inspector-repo-facts'),
  inspectorObserve: document.querySelector('#inspector-observe'),
  inspectorReset: document.querySelector('#inspector-reset'),
  inspectorSummary: document.querySelector('#inspector-summary'),
  inspectorList: document.querySelector('#inspector-list'),
  inspectorNote: document.querySelector('#inspector-note'),
  inspectorAnnouncement: document.querySelector('#inspector-announcement'),
};

const inspector = { initial: null, busy: false };

void initialize();

async function initialize() {
  bindControls();
  initializeMotion();
  renderCliStep(0);
  if (state.reducedMotion) void showReducedMotionCliResult();
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
  void loadInspector();
}

function bindControls() {
  elements.inspectorObserve.addEventListener('click', () => void observeInspector());
  elements.inspectorReset.addEventListener('click', resetInspector);
  elements.run.addEventListener('click', () => void runAudit());
  elements.reset.addEventListener('click', resetAudit);
  elements.heroWatch.addEventListener('click', restartHeroAnimation);
  elements.heroToggle.addEventListener('click', toggleHeroAnimation);
  elements.cliRunAll.addEventListener('click', () => void runFullCliDemo());
  elements.cliNext.addEventListener('click', () => void advanceCliDemo());
  elements.cliReset.addEventListener('click', resetCliDemo);
  elements.cliToggle.addEventListener('click', toggleCliSequence);
  elements.cliSelect.addEventListener('change', () => void selectCliStep(Number(elements.cliSelect.value)));
  elements.budget.addEventListener('input', () => {
    elements.budgetOutput.textContent = elements.budget.value;
  });
  for (const link of document.querySelectorAll('.mobile-nav a')) {
    link.addEventListener('click', () => link.closest('details').removeAttribute('open'));
  }
}

function initializeMotion() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) {
    state.reducedMotion = true;
    elements.heroDemo.classList.add('reduced-motion');
    elements.heroToggle.disabled = true;
    elements.heroToggleLabel.textContent = 'Animation shown as final state';
    elements.heroToggleIcon.textContent = '■';
    elements.cliToggle.disabled = true;
    elements.cliToggleLabel.textContent = 'Sequence shown as final state';
  } else {
    elements.heroDemo.classList.add('is-running');
    const heroObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) elements.heroDemo.classList.toggle('is-offscreen', !entry.isIntersecting);
    }, { threshold: 0.08 });
    heroObserver.observe(elements.heroDemo);
    const cliObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        state.cliOffscreen = !entry.isIntersecting;
        updateCliSequenceSchedule();
      }
    }, { threshold: 0.08 });
    cliObserver.observe(elements.cliShell);
  }

  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
  for (const section of document.querySelectorAll('.reveal-section')) revealObserver.observe(section);

  const navLinks = [...document.querySelectorAll('.site-header nav a')];
  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    for (const link of navLinks) {
      if (link.getAttribute('href') === `#${visible.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { threshold: [0.15, 0.4], rootMargin: '-20% 0px -65% 0px' });
  for (const section of document.querySelectorAll('main section[id]')) sectionObserver.observe(section);

  document.addEventListener('visibilitychange', () => {
    elements.heroDemo.classList.toggle('is-page-paused', document.hidden);
    updateCliSequenceSchedule();
  });
}

function toggleHeroAnimation() {
  state.heroPaused = !state.heroPaused;
  elements.heroDemo.classList.toggle('is-paused', state.heroPaused);
  elements.heroToggle.setAttribute('aria-pressed', String(state.heroPaused));
  elements.heroToggleLabel.textContent = state.heroPaused ? 'Play animation' : 'Pause animation';
  elements.heroToggleIcon.textContent = state.heroPaused ? '▶' : 'Ⅱ';
}

function restartHeroAnimation() {
  state.heroPaused = false;
  elements.heroDemo.classList.remove('is-paused', 'is-running');
  elements.heroToggle.setAttribute('aria-pressed', 'false');
  elements.heroToggleLabel.textContent = 'Pause animation';
  elements.heroToggleIcon.textContent = 'Ⅱ';
  void elements.heroDemo.offsetWidth;
  elements.heroDemo.classList.add('is-running');
  elements.heroDemo.scrollIntoView({ block: 'center' });
}

function cliStepDefinition(index, result) {
  const canonicalOutcome = result ? result.outcome : 'Pending canonical audit';
  const permission = result ? result.permissionConsequence : 'The canonical engine has not evaluated this fixture yet.';
  const nextStep = result ? result.recommendedNextStep : 'Run the canonical audit before relying on this memory.';
  const selectedCount = result ? result.context.selected.length : 0;
  const excludedCount = result ? result.context.excluded.length : 0;
  return [
    {
      label: 'Step 1 · Initialize',
      title: 'Create controlled local storage.',
      explanation: 'Tamhees creates a structured local store. Nothing is uploaded, and the guided page does not execute this command.',
      command: 'tamhees init',
      output: ['Created .tamhees/config.json', 'Initialized local Tamhees storage.'],
      facts: [['Safety gate', 'Project boundary'], ['Agent permission', 'No action decision yet'], ['Why it matters', 'Memory gets an inspectable home instead of an unquestioned monolithic file.']],
    },
    {
      label: 'Step 2 · Memory',
      title: 'Record the remembered owner decision with limits.',
      explanation: 'The fixture records “Use SQLite” as an owner-sourced claim. Provenance and action permission stay attached to the statement.',
      command: 'tamhees memory apply --input <safe-memory-fixture>',
      output: ['Applied memory: safe-memory-architecture', 'Source: OWNER · permission: ASK_OWNER'],
      facts: [['Safety gate', 'Provenance'], ['Agent permission', 'Ask the owner before a material architecture action'], ['Why it matters', 'A statement is not detached from who supplied it or what it may authorize.']],
    },
    {
      label: 'Step 3 · Evidence',
      title: 'Add what the repository currently proves.',
      explanation: 'A second fixed fixture records current Supabase configuration as contradictory repository evidence.',
      command: 'tamhees evidence add --input <safe-evidence-fixture>',
      output: ['Added evidence: safe-evidence-supabase', 'Relationship: CONTRADICTS remembered SQLite decision'],
      facts: [['Safety gate', 'Current evidence'], ['Agent permission', 'Still undecided until audit'], ['Why it matters', 'Current project facts can challenge a once-valid memory.']],
    },
    {
      label: 'Step 4 · Audit',
      title: 'Let the canonical engine decide whether action is safe.',
      explanation: `The real local audit returns ${canonicalOutcome}. The page presents that result; it does not choose it.`,
      command: 'tamhees audit',
      output: [`Outcome: ${canonicalOutcome}`, `Permission: ${permission}`],
      facts: [['Safety gate', 'Freshness, evidence, privacy, and permission'], ['Agent permission', permission], ['Why it matters', 'A contradiction becomes an explicit action gate, not a quiet guess.']],
    },
    {
      label: 'Step 5 · Context',
      title: 'Build task context without the unsafe memory.',
      explanation: `The canonical context engine selected ${selectedCount} and excluded ${excludedCount} fixture record(s).`,
      command: 'tamhees context --task "prepare the database migration"',
      output: [`Selected: ${selectedCount} · Excluded: ${excludedCount}`, `Next: ${nextStep}`],
      facts: [['Safety gate', 'Safe relevance and hard context budget'], ['Agent permission', permission], ['Why it matters', nextStep]],
    },
  ][index];
}

function renderCliStep(index, announce = false) {
  const boundedIndex = Math.max(0, Math.min(4, index));
  const step = cliStepDefinition(boundedIndex, state.cliResult);
  state.cliStep = boundedIndex;
  elements.cliSelect.value = String(boundedIndex);
  elements.cliStatus.textContent = `Showing step ${boundedIndex + 1} of 5.`;
  [...elements.cliProgress.children].forEach((item, itemIndex) => {
    item.dataset.state = itemIndex < boundedIndex ? 'complete' : itemIndex === boundedIndex ? 'current' : 'waiting';
  });
  elements.cliLog.replaceChildren();
  elements.cliLog.append(textEl('p', 'terminal-command', `$ ${step.command}`));
  for (const line of step.output) elements.cliLog.append(textEl('p', 'terminal-output', line));
  elements.lessonStep.textContent = step.label;
  elements.lessonTitle.textContent = step.title;
  elements.lessonExplanation.textContent = step.explanation;
  elements.lessonFacts.replaceChildren();
  for (const [term, description] of step.facts) {
    const row = el('div');
    row.append(textEl('dt', '', term), textEl('dd', '', description));
    elements.lessonFacts.append(row);
  }
  elements.cliNext.disabled = boundedIndex === 4 || state.cliAuto;
  if (announce) elements.cliAnnouncement.textContent = `${step.label}. ${step.title}`;
}

async function prepareCliResult() {
  if (state.cliResult) return state.cliResult;
  state.cliResult = await getJson('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId: 'architecture-conflict', maxTokens: 240 }),
  });
  return state.cliResult;
}

async function runFullCliDemo() {
  stopCliSequence();
  setCliBusy(true);
  try {
    await prepareCliResult();
    renderCliStep(state.reducedMotion ? 4 : 0, true);
    if (state.reducedMotion) {
      setCliBusy(false);
      return;
    }
    state.cliAuto = true;
    elements.cliRunAll.textContent = 'Running demo…';
    updateCliSequenceSchedule();
  } catch {
    renderCliError();
  }
}

async function advanceCliDemo() {
  if (state.cliStep >= 4 || state.cliAuto) return;
  setCliBusy(true);
  try {
    const nextIndex = state.cliStep + 1;
    if (nextIndex >= 3) await prepareCliResult();
    renderCliStep(nextIndex, true);
  } catch {
    renderCliError();
  } finally {
    if (!state.cliAuto) setCliBusy(false);
  }
}

async function selectCliStep(index) {
  stopCliSequence();
  setCliBusy(true);
  try {
    if (index >= 3) await prepareCliResult();
    renderCliStep(index, true);
  } catch {
    renderCliError();
  } finally {
    setCliBusy(false);
  }
}

function resetCliDemo() {
  stopCliSequence();
  state.cliResult = null;
  renderCliStep(0);
  setCliBusy(false);
  elements.cliAnnouncement.textContent = 'Guided CLI demonstration reset to step 1.';
  elements.cliRunAll.focus();
}

function toggleCliSequence() {
  state.cliPaused = !state.cliPaused;
  elements.cliToggle.setAttribute('aria-pressed', String(state.cliPaused));
  elements.cliToggleLabel.textContent = state.cliPaused ? 'Play sequence' : 'Pause sequence';
  elements.cliAnnouncement.textContent = state.cliPaused ? 'Guided sequence paused.' : 'Guided sequence resumed.';
  updateCliSequenceSchedule();
}

function updateCliSequenceSchedule() {
  clearCliTimers();
  if (!state.cliAuto || state.cliPaused || state.cliOffscreen || document.hidden) return;
  if (state.cliStep >= 4) {
    stopCliSequence();
    setCliBusy(false);
    elements.cliAnnouncement.textContent = 'Guided CLI demonstration complete.';
    return;
  }
  const timer = window.setTimeout(() => {
    renderCliStep(state.cliStep + 1, true);
    updateCliSequenceSchedule();
  }, 1400);
  state.cliTimers.push(timer);
}

function stopCliSequence() {
  state.cliAuto = false;
  clearCliTimers();
  elements.cliRunAll.textContent = 'Run full demo';
}

function clearCliTimers() {
  for (const timer of state.cliTimers) window.clearTimeout(timer);
  state.cliTimers = [];
}

function setCliBusy(isBusy) {
  elements.cliRunAll.disabled = isBusy;
  elements.cliReset.disabled = false;
  elements.cliSelect.disabled = isBusy && !state.cliAuto;
  elements.cliNext.disabled = isBusy || state.cliStep === 4;
}

function renderCliError() {
  stopCliSequence();
  setCliBusy(false);
  elements.cliLog.replaceChildren(textEl('p', 'terminal-output terminal-error', 'The canonical local audit could not complete. Restart the dashboard and retry.'));
  elements.cliAnnouncement.textContent = 'The guided CLI demonstration could not complete.';
}

async function showReducedMotionCliResult() {
  setCliBusy(true);
  try {
    await prepareCliResult();
    renderCliStep(4);
  } catch {
    renderCliError();
  } finally {
    setCliBusy(false);
  }
}

function renderScenarioList() {
  elements.scenarioList.replaceChildren();
  elements.scenarioCount.textContent = `${state.scenarios.length} examples`;
  state.scenarios.forEach((scenario, index) => {
    const copy = presentation[scenario.id];
    const button = el('button', 'scenario-button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(scenario.id === state.selectedId));
    button.dataset.scenarioId = scenario.id;
    button.append(
      textEl('span', 'scenario-index', String(index + 1).padStart(2, '0')),
      textEl('strong', '', copy.name),
      textEl('small', '', copy.description),
    );
    button.addEventListener('click', () => {
      if (!state.running) selectScenario(scenario.id);
    });
    elements.scenarioList.append(button);
  });
}

function selectScenario(scenarioId) {
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  const copy = presentation[scenarioId];
  if (!scenario || !copy) return;
  state.selectedId = scenario.id;
  elements.concept.textContent = scenario.concept;
  elements.title.textContent = scenario.title;
  elements.summary.textContent = scenario.summary;
  elements.inputMemory.textContent = copy.memory;
  elements.inputEvidence.textContent = copy.evidence;
  elements.inputIntent.textContent = copy.intent;
  elements.budget.value = String(scenario.defaultMaxTokens);
  elements.budgetOutput.textContent = String(scenario.defaultMaxTokens);
  const isBudgetScenario = scenario.id === 'context-budget';
  elements.advanced.open = isBudgetScenario;
  elements.advanced.dataset.primary = String(isBudgetScenario);
  elements.advanced.querySelector('summary').textContent = isBudgetScenario
    ? 'Context space is limited'
    : 'Advanced context settings';
  for (const button of elements.scenarioList.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.scenarioId === scenario.id));
  }
  resetAudit(false);
}

async function runAudit() {
  if (state.running) return;
  state.running = true;
  elements.run.disabled = true;
  for (const button of elements.scenarioList.querySelectorAll('button')) button.disabled = true;
  elements.result.setAttribute('aria-busy', 'true');
  elements.ready.hidden = true;
  elements.result.hidden = true;
  startAuditProgress();
  try {
    const result = await getJson('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId: state.selectedId,
        maxTokens: Number(elements.budget.value),
      }),
    });
    completeAuditProgress();
    renderResult(result);
    elements.announcement.textContent = `Audit complete: ${result.outcome}. Focus moved to the result.`;
    elements.result.focus();
  } catch {
    completeAuditProgress();
    renderRequestError();
  } finally {
    state.running = false;
    elements.run.disabled = false;
    for (const button of elements.scenarioList.querySelectorAll('button')) button.disabled = false;
    elements.result.setAttribute('aria-busy', 'false');
  }
}

function startAuditProgress() {
  clearProgressTimers();
  elements.progress.hidden = false;
  const stages = [...elements.progress.querySelectorAll('li')];
  stages.forEach((stage) => { stage.dataset.stage = 'waiting'; });
  stages.forEach((stage, index) => {
    const timer = window.setTimeout(() => {
      if (index > 0) stages[index - 1].dataset.stage = 'complete';
      stage.dataset.stage = 'checking';
    }, index * 180);
    state.progressTimers.push(timer);
  });
}

function completeAuditProgress() {
  clearProgressTimers();
  for (const stage of elements.progress.querySelectorAll('li')) stage.dataset.stage = 'complete';
}

function clearProgressTimers() {
  for (const timer of state.progressTimers) window.clearTimeout(timer);
  state.progressTimers = [];
}

function resetAudit(restoreFocus = true) {
  clearProgressTimers();
  for (const stage of elements.progress.querySelectorAll('li')) stage.dataset.stage = 'waiting';
  elements.progress.hidden = true;
  elements.result.hidden = true;
  elements.result.classList.remove('result-enter');
  elements.result.setAttribute('aria-busy', 'false');
  elements.ready.hidden = false;
  elements.technicalDetails.open = false;
  elements.plainResult.replaceChildren();
  elements.resultContext.replaceChildren();
  elements.technicalResult.replaceChildren();
  elements.announcement.textContent = restoreFocus ? 'Example reset.' : '';
  if (restoreFocus) elements.run.focus();
}

function renderResult(result) {
  const copy = presentation[result.scenario.id];
  elements.plainResult.replaceChildren();
  elements.plainResult.dataset.outcome = result.outcome;
  const headingRow = el('div', 'plain-heading');
  headingRow.append(
    textEl('h3', '', copy.resultTitle),
    textEl('span', 'outcome-code', `${outcomeSymbol(result.outcome)} ${result.outcome}`),
  );
  const explanations = el('div', 'plain-explanations');
  explanations.append(
    plainCard('Why', copy.why),
    plainCard('What the agent is allowed to do', result.permissionConsequence),
    plainCard('What happens next', result.recommendedNextStep),
  );
  elements.plainResult.append(headingRow, explanations);
  elements.resultContext.replaceChildren(contextCard(result.context));

  const resultGrid = el('div', 'result-grid');
  resultGrid.append(
    memoriesCard(result.memories),
    evidenceCard(result.evidence, result.evidenceConsidered),
    traceCard(result.ruleTrace),
  );
  elements.technicalResult.replaceChildren(resultGrid);
  elements.fixtureNote.textContent = result.fixtureDisclaimer;
  elements.technicalDetails.open = false;
  elements.result.hidden = false;
  elements.result.classList.remove('result-enter');
  void elements.result.offsetWidth;
  elements.result.classList.add('result-enter');
}

function plainCard(title, content) {
  const card = el('section');
  card.append(textEl('h4', '', title), textEl('p', '', content));
  return card;
}

function detailCard(title, content) {
  const card = el('section', 'result-card');
  card.append(textEl('h4', '', title), textEl('p', '', content));
  return card;
}

function memoriesCard(memories) {
  const card = el('section', 'result-card');
  card.append(textEl('h4', '', 'Remembered claims'));
  const list = el('ul', 'data-list');
  for (const memory of memories) {
    const item = el('li');
    item.append(textEl('code', '', memory.id), textEl('p', '', memory.statement), textEl('span', 'meta-line', `${memory.verificationStatus} · ${memory.confidence} confidence · ${memory.actionPermission} · ${memory.sensitivity}`));
    list.append(item);
  }
  card.append(list);
  return card;
}

function evidenceCard(evidence, consideredIds) {
  const card = el('section', 'result-card');
  card.append(textEl('h4', '', 'Evidence considered'));
  const list = el('ul', 'data-list');
  if (evidence.length === 0) list.append(textEl('li', 'empty-state', 'No evidence record is needed for the privacy-first rule.'));
  for (const item of evidence) {
    const row = el('li');
    const considered = consideredIds.includes(item.id) ? 'EXAMINED' : 'AVAILABLE';
    row.append(textEl('code', '', item.id), textEl('p', '', item.summary), textEl('span', 'meta-line', `${considered} · ${item.type} · ${item.relationship}`));
    list.append(row);
  }
  card.append(list);
  return card;
}

function traceCard(trace) {
  const card = el('section', 'result-card');
  card.append(textEl('h4', '', 'Triggered rule trace'));
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
  card.append(textEl('h4', '', 'Ephemeral task context'));
  const budget = el('div', 'budget-summary');
  const progress = el('progress');
  progress.max = context.budget.maxTokens;
  progress.value = context.budget.estimatedTokensUsed;
  progress.setAttribute('aria-label', `${context.budget.estimatedTokensUsed} of ${context.budget.maxTokens} estimated tokens used`);
  budget.append(textEl('span', '', `${context.budget.estimatedTokensUsed} used`), progress, textEl('span', '', `${context.budget.estimatedTokensRemaining} remaining`));
  card.append(budget);
  const columns = el('div', 'context-columns');
  columns.append(contextList('Selected context', context.selected, true), contextList('Excluded context', context.excluded, false));
  card.append(columns);
  return card;
}

function contextList(title, items, selected) {
  const region = el('div');
  region.append(textEl('h5', '', title));
  const list = el('ul', 'context-list');
  if (items.length === 0) list.append(textEl('li', 'empty-state', selected ? 'No record passed every safety, relevance, and budget gate.' : 'No record was excluded.'));
  for (const item of items) {
    const row = el('li');
    row.append(textEl('code', '', selected ? item.memoryId : `${item.memoryId} · ${item.reasonCode}`), textEl('p', '', selected ? item.statement : item.reason));
    if (selected) row.append(textEl('span', 'meta-line', `rank ${item.rank} · score ${item.ranking.totalScore} · ${item.estimatedTokens} estimated tokens`));
    list.append(row);
  }
  region.append(list);
  return region;
}

function renderBenchmark(benchmark) {
  for (const configuration of benchmark.configurations) {
    const overview = document.querySelector(`.benchmark-overview [data-configuration="${configuration.name}"]`);
    if (overview) {
      overview.querySelector('output').textContent = fractionText(configuration.outcomeCorrectness);
      overview.querySelector('progress').value = configuration.outcomeCorrectness.numerator;
    }
  }
  const tamheesConfiguration = benchmark.configurations.find((item) => item.name === 'TAMHEES');
  if (tamheesConfiguration) {
    elements.metricPrecision.textContent = spacedFractionText(tamheesConfiguration.retrievalMicro.precision);
    elements.metricUnsafe.textContent = String(tamheesConfiguration.unsafeExposureCount);
    elements.metricSecret.textContent = String(tamheesConfiguration.secretLeakageCount);
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
  elements.benchmarkNote.textContent = `${benchmark.limitation} Artifact SHA-256: ${benchmark.artifactSha256}.`;
  elements.methodology.replaceChildren(
    textEl('p', '', benchmark.methodology.groundTruthPolicy),
    textEl('p', '', benchmark.methodology.safetyAdjustedRecallPolicy),
    textEl('p', '', benchmark.methodology.undefinedMetricPolicy),
    textEl('p', '', benchmark.methodology.noMemoryPolicy),
    textEl('p', '', `${benchmark.scenarioCount} fixed scenarios; generated ${benchmark.generatedAt}.`),
  );
}

function fractionText(ratio) { return `${ratio.numerator} / ${ratio.denominator}`; }
function spacedFractionText(ratio) { return `${ratio.numerator} / ${ratio.denominator}`; }
function ratioText(ratio) {
  if (ratio.value === null) return `N/A (${ratio.numerator}/${ratio.denominator})`;
  const percentage = (ratio.value * 100).toFixed(ratio.value === 0 || ratio.value === 1 ? 0 : 1);
  return `${ratio.numerator}/${ratio.denominator} · ${percentage}%`;
}
function configurationLabel(value) {
  const labels = { NO_MEMORY: 'No memory', MONOLITHIC_GPTBRAIN: 'Monolithic GPTBrain', SIMPLE_SPLIT_FILES: 'Simple split files', TAMHEES: 'Tamhees' };
  return labels[value] || value;
}
function outcomeSymbol(outcome) {
  const symbols = { TRUST: '✓', RECHECK: '↻', ASK_OWNER: '?', BLOCK_ACTION: '⊘', FORGET_OR_REDACT: '⌫' };
  return symbols[outcome] || '!';
}

// ─── Memory inspector ───────────────────────────────────────

const INSPECTOR_PLAIN = {
  TRUST: 'I can rely on this.',
  RECHECK: 'I might be wrong. Verify before acting.',
  ASK_OWNER: 'This is a guess. Ask the owner first.',
  BLOCK_ACTION: 'Do not act on this.',
  FORGET_OR_REDACT: 'This must not be kept or shown.',
};

async function loadInspector() {
  try {
    const view = await getJson('/api/inspector');
    inspector.initial = view;
    renderInspectorRepository(view.repository);
    renderInspector(view.report, null, null);
    elements.inspectorNote.textContent = view.fixtureDisclaimer;
  } catch {
    elements.inspectorSummary.textContent = 'The inspector fixture could not be loaded. Reload the page.';
    elements.inspectorObserve.disabled = true;
  }
}

function renderInspectorRepository(repository) {
  elements.inspectorRepoName.textContent = repository.name;
  const facts = [
    ['Files', repository.files.join(', ')],
    ['Package manager', repository.packageManager],
    ['Dependencies', repository.dependencies.join(', ')],
    ['Scripts', repository.scripts.join(', ')],
  ];
  elements.inspectorRepoFacts.replaceChildren(...facts.map(([term, value]) => {
    const row = el('div');
    row.append(textEl('dt', '', term), textEl('dd', '', value));
    return row;
  }));
}

async function observeInspector() {
  if (inspector.busy || inspector.initial === null) return;
  inspector.busy = true;
  elements.inspectorObserve.disabled = true;
  try {
    const result = await getJson('/api/observe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    renderInspector(result.report, inspector.initial.report, result);
    const contradicted = new Set(result.observations.filter((item) => item.relationship === 'CONTRADICTS').map((item) => item.memoryId)).size;
    const confirmed = new Set(result.observations.filter((item) => item.relationship === 'SUPPORTS').map((item) => item.memoryId)).size;
    const summary = `Tamhees read the project's manifest files and found ${contradicted} memories the repository now contradicts and ${confirmed} it confirms. `
      + `${result.skipped.length > 0 ? `${result.skipped.length} statement was skipped rather than guessed. ` : ''}`
      + 'Contradicted memories are now blocked and withheld from the agent.';
    elements.inspectorSummary.textContent = summary;
    elements.inspectorAnnouncement.textContent = summary;
    elements.inspectorReset.disabled = false;
  } catch {
    elements.inspectorSummary.textContent = 'The repository check could not complete. Reset and retry.';
    elements.inspectorObserve.disabled = false;
  } finally {
    inspector.busy = false;
  }
}

function resetInspector() {
  if (inspector.initial === null) return;
  renderInspector(inspector.initial.report, null, null);
  elements.inspectorSummary.textContent = 'Before checking: the memories as the agent last saw them.';
  elements.inspectorAnnouncement.textContent = 'Inspector reset.';
  elements.inspectorObserve.disabled = false;
  elements.inspectorReset.disabled = true;
  elements.inspectorObserve.focus();
}

function renderInspector(report, before, observation) {
  elements.inspectorList.replaceChildren(...report.memories.map((memory) => {
    const previous = before ? before.memories.find((item) => item.id === memory.id) : null;
    const changed = previous !== null && previous !== undefined && previous.outcome !== memory.outcome;
    const item = el('li', 'inspector-item');
    item.dataset.outcome = memory.outcome;
    item.dataset.changed = String(changed);
    const head = el('div', 'inspector-head');
    head.append(textEl('span', 'outcome-code', `${outcomeSymbol(memory.outcome)} ${memory.outcome}`));
    if (changed) head.append(textEl('span', 'inspector-chip', `was ${previous.outcome}`));
    if (!memory.servable) head.append(textEl('span', 'inspector-chip inspector-chip-withheld', 'Withheld from the agent'));
    const freshness = memory.freshness.state === 'CURRENT'
      ? `verified ${memory.freshness.ageDays} days ago`
      : `${memory.freshness.state.toLowerCase().replace('_', ' ')}, verified ${memory.freshness.ageDays} days ago`;
    const findings = observation ? observation.observations.filter((entry) => entry.memoryId === memory.id) : [];
    // When the repository check explains the change, show that plain reason instead of evidence IDs.
    const plain = findings.length > 0 ? INSPECTOR_PLAIN[memory.outcome] : `${INSPECTOR_PLAIN[memory.outcome]} ${memory.explanation}`;
    item.append(
      head,
      textEl('p', 'inspector-statement', memory.statement),
      textEl('p', 'inspector-plain', plain),
      textEl('p', 'inspector-meta', `${memory.source.type} · ${memory.verificationStatus} · confidence ${memory.confidence} · ${freshness} · ${memory.actionPermission}`),
    );
    if (observation) {
      for (const finding of findings) {
        const line = textEl('p', 'inspector-finding', `${finding.relationship === 'CONTRADICTS' ? '✘' : '✔'} ${finding.explanation}`);
        line.dataset.relationship = finding.relationship;
        item.append(line);
      }
      for (const skipped of observation.skipped.filter((entry) => entry.memoryId === memory.id)) {
        item.append(textEl('p', 'inspector-finding', `Skipped: ${skipped.reason}.`));
      }
    }
    return item;
  }));
}

function renderRequestError() {
  elements.plainResult.replaceChildren(textEl('h3', '', 'The local audit could not complete'), textEl('p', '', 'Retry the example. If the problem continues, restart the local dashboard command.'));
  elements.resultContext.replaceChildren();
  elements.technicalResult.replaceChildren();
  elements.result.hidden = false;
  elements.announcement.textContent = 'The local audit could not complete. Retry or restart the dashboard.';
  elements.result.focus();
}

function showStartupError() {
  elements.scenarioList.replaceChildren(textEl('p', 'empty-state', 'Local scenario metadata is unavailable. Restart the dashboard.'));
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
function el(tag, className = '') { const node = document.createElement(tag); if (className) node.className = className; return node; }
function textEl(tag, className, text) { const node = el(tag, className); node.textContent = text; return node; }
