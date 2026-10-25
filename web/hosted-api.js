// Tamhees hosted demo adapter.
//
// The local dashboard asks a loopback Node server for /api/scenarios, /api/audit and
// /api/benchmark. In the hosted (static) demo there is no server: this module answers
// those same requests inside the visitor's browser by running the unchanged Tamhees
// engine modules (compiled from src/core and src/dashboard/scenarios.ts).
//
// Nothing is sent anywhere. The benchmark artifact is pre-generated at build time by
// scripts/build-static-site.mjs using the same integrity-checked loader as the server.

import './shims/buffer-global.js';
import {
  isDashboardScenarioId,
  listDashboardScenarios,
  runDashboardScenario,
} from './engine/dashboard/scenarios.js';
import { getInspectorView, runInspectorObservation } from './engine/dashboard/inspector.js';

const nativeFetch = window.fetch.bind(window);
const API_ROUTE = /\/api\/(scenarios|audit|benchmark|inspector|observe)$/;

function json(status, body) {
  // Same byte shape as sendJson() in src/dashboard/server.ts (trailing newline included).
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function problem(status, code, message) {
  return json(status, { error: { code, message } });
}

// Mirrors parseAuditRequest() in src/dashboard/server.ts.
function parseAuditRequest(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'scenarioId' && key !== 'maxTokens')) return null;
  if (typeof value.scenarioId !== 'string') return null;
  const { maxTokens } = value;
  if (
    maxTokens !== undefined
    && (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000_000)
  ) {
    return { budgetError: true };
  }
  return { scenarioId: value.scenarioId, maxTokens };
}

async function handle(route, init) {
  const method = (init?.method ?? 'GET').toUpperCase();

  if (route === 'scenarios') {
    if (method !== 'GET') return problem(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for the requested local route.');
    return json(200, { schemaVersion: '1.0.0', scenarios: listDashboardScenarios() });
  }

  if (route === 'benchmark') {
    if (method !== 'GET') return problem(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for the requested local route.');
    return nativeFetch(new URL('data/benchmark.json', document.baseURI));
  }

  if (route === 'inspector') {
    if (method !== 'GET') return problem(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for the requested local route.');
    return json(200, getInspectorView());
  }

  if (route === 'observe') {
    if (method !== 'POST') return problem(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for the requested local route.');
    let body;
    try {
      body = JSON.parse(typeof init?.body === 'string' ? init.body : '');
    } catch {
      body = null;
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length > 0) {
      return problem(400, 'INVALID_REQUEST', 'The observe request takes an empty JSON object.');
    }
    return json(200, runInspectorObservation());
  }

  // route === 'audit'
  if (method !== 'POST') return problem(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for the requested local route.');
  const input = parseAuditRequest(typeof init?.body === 'string' ? init.body : '');
  if (input === null) return problem(400, 'INVALID_REQUEST', 'The dashboard request schema is invalid.');
  if (input.budgetError) {
    return problem(400, 'INVALID_REQUEST', 'The context budget must be an integer from 1 through 1000000.');
  }
  if (!isDashboardScenarioId(input.scenarioId)) {
    return problem(400, 'INVALID_REQUEST', 'The requested scenario is not available.');
  }
  return json(200, runDashboardScenario(input.scenarioId, input.maxTokens));
}

window.fetch = async (input, init) => {
  const target = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(target, document.baseURI);
  const match = url.origin === location.origin ? url.pathname.match(API_ROUTE) : null;
  if (match === null) return nativeFetch(input, init);
  try {
    return await handle(match[1], init);
  } catch (error) {
    console.error('Tamhees hosted demo:', error);
    return problem(500, 'INTERNAL_ERROR', 'The in-browser engine could not complete the request. Reload the page and retry.');
  }
};

// Small, honest notice so visitors know how the hosted demo differs from the local one.
function addHostedNotice() {
  const notice = document.createElement('div');
  notice.className = 'hosted-notice';
  notice.setAttribute('role', 'note');
  notice.textContent =
    'Hosted demo: the real Tamhees engine runs inside your browser. No server, no AI API, nothing leaves your device.';
  document.body.prepend(notice);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addHostedNotice, { once: true });
} else {
  addHostedNotice();
}
