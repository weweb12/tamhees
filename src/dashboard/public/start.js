'use strict';

// Judge-facing overview: three guided steps over the same fixture project as the full
// demo's Inspector. Every outcome comes from the engine via /api/inspector-state
// (the loopback server locally, the in-browser engine on the hosted demo).

const STEP1_IDS = ['DM-MEM-SHOP-001', 'DM-MEM-SHOP-004', 'DM-MEM-SHOP-006'];
const OWNER_ID = 'DM-MEM-SHOP-009';
const GUESS_ID = 'DM-MEM-SHOP-007';

const LABEL = {
  TRUST: { text: '✓ Safe to use', tone: 'good' },
  RECHECK: { text: '↻ Check before using', tone: 'careful' },
  ASK_OWNER: { text: '? Ask the owner first', tone: 'careful' },
  BLOCK_ACTION: { text: '⊘ Blocked', tone: 'bad' },
  FORGET_OR_REDACT: { text: '⌫ Must not be kept', tone: 'bad' },
};

const SOURCE = {
  OWNER_INSTRUCTION: 'the owner',
  REPOSITORY_STATE: 'the repository',
  TEST_RESULT: 'a test',
  AGENT_OBSERVATION: 'what the agent saw',
  AGENT_INFERENCE: 'an AI guess',
  DOCUMENT_REFERENCE: 'a document',
  CONVERSATION_RECORD: 'a chat',
  SYSTEM_OBSERVATION: 'the system',
};

const state = { observed: false, forgotten: [], guessChecked: false, report: null, observations: [], busy: false };

const $ = (selector) => document.querySelector(selector);
const elements = {
  deps: $('#project-deps'),
  step1List: $('#step1-memories'),
  step2List: $('#step2-memories'),
  step3List: $('#step3-memories'),
  step1Run: $('#step1-run'),
  step2Run: $('#step2-run'),
  step3Run: $('#step3-run'),
  step1Result: $('#step1-result'),
  step2Result: $('#step2-result'),
  step3Result: $('#step3-result'),
  reset: $('#demo-reset'),
  announce: $('#demo-announcement'),
  error: $('#demo-error'),
};

void initialize();

async function initialize() {
  elements.step1Run.addEventListener('click', () => void runStep1());
  elements.step2Run.addEventListener('click', () => void runStep2());
  elements.step3Run.addEventListener('click', runStep3);
  elements.reset.addEventListener('click', () => void reset());
  try {
    const view = await getJson('/api/inspector');
    elements.deps.replaceChildren(...view.repository.dependencies.map((name) => textEl('li', '', name)));
    await refresh();
    for (const button of [elements.step1Run, elements.step2Run, elements.step3Run]) button.disabled = false;
  } catch {
    elements.error.hidden = false;
  }
}

async function refresh() {
  const result = await getJson('/api/inspector-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observed: state.observed, forgotten: state.forgotten }),
  });
  state.report = result.report;
  state.observations = result.observations;
  render();
}

function memoryById(id) {
  return state.report.memories.find((memory) => memory.id === id);
}

function render() {
  elements.step1List.replaceChildren(...STEP1_IDS.map((id) => memoryCard(memoryById(id), { showReason: state.observed })));
  elements.step2List.replaceChildren(memoryCard(memoryById(OWNER_ID), { showReason: false }));
  elements.step3List.replaceChildren(memoryCard(memoryById(GUESS_ID), { showReason: false, hideOutcome: !state.guessChecked }));
}

function memoryCard(memory, { showReason, hideOutcome = false }) {
  const item = el('li', 'memory');
  if (memory.forgotten) {
    item.dataset.tone = 'gone';
    const top = el('div', 'memory-top');
    top.append(textEl('span', 'badge', '⌫ Forgotten'), textEl('span', 'memory-meta', 'Hidden from the agent'));
    item.append(top, textEl('p', 'memory-text', memory.statement), textEl('p', 'memory-why', 'Only a tombstone remains: the memory ID and when it was removed. The text is gone.'));
    return item;
  }
  const label = LABEL[memory.outcome];
  item.dataset.tone = hideOutcome ? 'neutral' : label.tone;
  const top = el('div', 'memory-top');
  if (!hideOutcome) top.append(textEl('span', 'badge', label.text));
  const meta = `From ${SOURCE[memory.source.type] ?? 'unknown'} · confidence ${memory.confidence.toLowerCase()} · checked ${memory.freshness.ageDays} days ago`;
  top.append(textEl('span', 'memory-meta', meta));
  item.append(top, textEl('p', 'memory-text', memory.statement));
  if (showReason) {
    const finding = state.observations.find((entry) => entry.memoryId === memory.id);
    const why = finding ? finding.explanation : memory.nextStep;
    item.append(textEl('p', 'memory-why', `${finding && finding.relationship === 'CONTRADICTS' ? '✘ ' : finding ? '✔ ' : ''}${why}`));
  }
  return item;
}

async function runStep1() {
  if (state.busy || state.observed) return;
  await act(async () => {
    state.observed = true;
    await refresh();
    const blocked = STEP1_IDS.filter((id) => memoryById(id).outcome === 'BLOCK_ACTION').length;
    const kept = STEP1_IDS.length - blocked;
    elements.step1Run.disabled = true;
    show(elements.step1Result, `Nobody told Tamhees anything. It read the project's own files and blocked ${blocked} outdated ${blocked === 1 ? 'memory' : 'memories'}, and confirmed ${kept}. The agent will not see the blocked ones.`);
  });
}

async function runStep2() {
  if (state.busy || state.forgotten.includes(OWNER_ID)) return;
  await act(async () => {
    state.forgotten = [...state.forgotten, OWNER_ID];
    await refresh();
    elements.step2Run.disabled = true;
    show(elements.step2Result, 'Forgotten. The text is erased everywhere, not just hidden, and the agent can never see it again.');
  });
}

function runStep3() {
  if (state.busy || state.guessChecked) return;
  state.guessChecked = true;
  render();
  elements.step3Run.disabled = true;
  elements.reset.hidden = false;
  const outcome = memoryById(GUESS_ID).outcome;
  show(elements.step3Result, outcome === 'ASK_OWNER'
    ? 'No. High confidence is not your approval. The agent may look and explain, but must ask you before changing anything.'
    : `Tamhees answered ${outcome}.`);
}

async function act(operation) {
  state.busy = true;
  try {
    await operation();
    elements.reset.hidden = false;
  } catch {
    elements.error.hidden = false;
  } finally {
    state.busy = false;
  }
}

async function reset() {
  state.observed = false;
  state.forgotten = [];
  state.guessChecked = false;
  for (const result of [elements.step1Result, elements.step2Result, elements.step3Result]) result.hidden = true;
  for (const button of [elements.step1Run, elements.step2Run, elements.step3Run]) button.disabled = false;
  elements.reset.hidden = true;
  await refresh();
  elements.announce.textContent = 'Demo reset.';
  elements.step1Run.focus();
}

function show(element, text) {
  element.textContent = text;
  element.hidden = false;
  elements.announce.textContent = text;
}

async function getJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error('Request failed.');
  return data;
}
function el(tag, className = '') { const node = document.createElement(tag); if (className) node.className = className; return node; }
function textEl(tag, className, text) { const node = el(tag, className); node.textContent = text; return node; }
