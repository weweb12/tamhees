import { getInspectorView, inspectorState, parseInspectorStateRequest, runInspectorObservation } from './inspector.js';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { PRODUCT_NAME } from '../core/identity.js';
import { loadDashboardBenchmark } from './benchmark.js';
import {
  isDashboardScenarioId,
  listDashboardScenarios,
  runDashboardScenario,
} from './scenarios.js';

export const DASHBOARD_HOST = '127.0.0.1';
export const DASHBOARD_DEFAULT_PORT = 8787;
export const DASHBOARD_MAX_BODY_BYTES = 16_384;

const STATIC_ASSETS = new Map([
  ['/', { file: 'index.html', contentType: 'text/html; charset=utf-8' }],
  ['/assets/dashboard.css', { file: 'dashboard.css', contentType: 'text/css; charset=utf-8' }],
  ['/assets/dashboard.js', { file: 'dashboard.js', contentType: 'text/javascript; charset=utf-8' }],
] as const);

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

interface DashboardServerOptions {
  readonly port?: number | undefined;
  readonly rootDir?: string | undefined;
}

export interface RunningDashboard {
  readonly server: Server;
  readonly host: typeof DASHBOARD_HOST;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

interface AuditRequest {
  readonly scenarioId: string;
  readonly maxTokens?: number | undefined;
}

class RequestProblem extends Error {
  constructor(
    readonly statusCode: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export async function startDashboardServer(
  options: DashboardServerOptions = {},
): Promise<RunningDashboard> {
  const port = options.port ?? DASHBOARD_DEFAULT_PORT;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Dashboard port must be an integer from 0 through 65535.');
  }
  const rootDir = options.rootDir ?? process.cwd();
  const server = createServer((request, response) => {
    void handleRequest(request, response, rootDir);
  });
  server.maxHeadersCount = 50;
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, DASHBOARD_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string' || address.address !== DASHBOARD_HOST) {
    await closeServer(server);
    throw new Error('Dashboard failed to bind to the loopback interface.');
  }
  const url = `http://${DASHBOARD_HOST}:${address.port}/`;
  return {
    server,
    host: DASHBOARD_HOST,
    port: address.port,
    url,
    close: async () => closeServer(server),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  rootDir: string,
): Promise<void> {
  applySecurityHeaders(response);
  try {
    rejectUnexpectedHost(request);
    const rawTarget = request.url ?? '/';
    const url = parseRequestTarget(rawTarget);
    rejectCrossOriginRequest(request);

    const staticAsset = STATIC_ASSETS.get(url.pathname as '/' | '/assets/dashboard.css' | '/assets/dashboard.js');
    if (staticAsset !== undefined) {
      requireMethod(request, response, ['GET', 'HEAD']);
      const filePath = fileURLToPath(new URL(`./public/${staticAsset.file}`, import.meta.url));
      const body = await readFile(filePath);
      response.statusCode = 200;
      response.setHeader('Content-Type', staticAsset.contentType);
      response.setHeader('Content-Length', body.byteLength);
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }

    if (url.pathname === '/api/scenarios') {
      requireMethod(request, response, ['GET']);
      sendJson(response, 200, {
        schemaVersion: '1.0.0',
        scenarios: listDashboardScenarios(),
      });
      return;
    }

    if (url.pathname === '/api/audit') {
      requireMethod(request, response, ['POST']);
      requireJsonContentType(request);
      const input = parseAuditRequest(await readJsonBody(request));
      if (!isDashboardScenarioId(input.scenarioId)) {
        throw new RequestProblem(400, 'The requested scenario is not available.');
      }
      sendJson(response, 200, runDashboardScenario(input.scenarioId, input.maxTokens));
      return;
    }

    if (url.pathname === '/api/inspector') {
      requireMethod(request, response, ['GET']);
      sendJson(response, 200, getInspectorView());
      return;
    }

    if (url.pathname === '/api/inspector-state') {
      requireMethod(request, response, ['POST']);
      requireJsonContentType(request);
      const state = parseInspectorStateRequest(await readJsonBody(request));
      if (state === null) {
        throw new RequestProblem(400, 'The inspector state takes {"observed": boolean, "forgotten": [fixture memory IDs]}.');
      }
      sendJson(response, 200, inspectorState(state));
      return;
    }

    if (url.pathname === '/api/observe') {
      requireMethod(request, response, ['POST']);
      requireJsonContentType(request);
      const body = await readJsonBody(request);
      if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length > 0) {
        throw new RequestProblem(400, 'The observe request takes an empty JSON object.');
      }
      sendJson(response, 200, runInspectorObservation());
      return;
    }

    if (url.pathname === '/api/benchmark') {
      requireMethod(request, response, ['GET']);
      sendJson(response, 200, {
        schemaVersion: '1.0.0',
        benchmark: await loadDashboardBenchmark(rootDir),
      });
      return;
    }

    throw new RequestProblem(404, 'The requested local dashboard route was not found.');
  } catch (error: unknown) {
    if (error instanceof RequestProblem) {
      sendJson(response, error.statusCode, {
        error: {
          code: statusCodeName(error.statusCode),
          message: error.publicMessage,
        },
      });
      return;
    }
    sendJson(response, 500, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The local dashboard could not complete the request. Retry or restart the dashboard.',
      },
    });
  }
}

function requireMethod(
  request: IncomingMessage,
  response: ServerResponse,
  allowed: readonly string[],
): void {
  if (request.method === undefined || !allowed.includes(request.method)) {
    response.setHeader('Allow', allowed.join(', '));
    throw new RequestProblem(405, 'This method is not supported for the requested local route.');
  }
}

function parseRequestTarget(rawTarget: string): URL {
  if (!rawTarget.startsWith('/') || rawTarget.startsWith('//')) {
    throw new RequestProblem(400, 'The request path is malformed.');
  }
  if (rawTarget.includes('?') || rawTarget.includes('#')) {
    throw new RequestProblem(400, 'Query parameters and fragments are not supported.');
  }
  const rawPath = rawTarget.split('?', 1)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new RequestProblem(400, 'The request path is malformed.');
  }
  if (
    decoded.includes('\0')
    || decoded.includes('\\')
    || decoded.split('/').some((segment) => segment === '.' || segment === '..')
    || /%(?:2e|2f|5c)/i.test(rawPath)
  ) {
    throw new RequestProblem(400, 'The request path is not allowed.');
  }
  try {
    return new URL(rawTarget, `http://${DASHBOARD_HOST}`);
  } catch {
    throw new RequestProblem(400, 'The request path is malformed.');
  }
}

function rejectUnexpectedHost(request: IncomingMessage): void {
  const localPort = request.socket.localPort;
  const expectedHost = Number.isSafeInteger(localPort)
    ? `${DASHBOARD_HOST}:${localPort}`
    : undefined;
  if (expectedHost === undefined || request.headers.host !== expectedHost) {
    throw new RequestProblem(403, 'The dashboard accepts only its printed loopback address.');
  }
}

function rejectCrossOriginRequest(request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (origin === undefined) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new RequestProblem(403, 'Cross-origin dashboard requests are not allowed.');
  }
  const localPort = request.socket.localPort;
  const expectedOrigin = Number.isSafeInteger(localPort)
    ? new URL(`http://${DASHBOARD_HOST}:${localPort}`).origin
    : '';
  if (parsed.origin !== expectedOrigin) {
    throw new RequestProblem(403, 'Cross-origin dashboard requests are not allowed.');
  }
}

function requireJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers['content-type'] ?? '';
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new RequestProblem(415, 'Send dashboard requests as application/json.');
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const declaredLength = request.headers['content-length'];
  if (
    declaredLength !== undefined
    && (/^(?:0|[1-9][0-9]*)$/.test(declaredLength) === false
      || Number(declaredLength) > DASHBOARD_MAX_BODY_BYTES)
  ) {
    request.resume();
    throw new RequestProblem(413, 'The dashboard request body is too large.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let oversized = false;
  for await (const chunkValue of request) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
    size += chunk.byteLength;
    if (size > DASHBOARD_MAX_BODY_BYTES) {
      oversized = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (oversized) {
    throw new RequestProblem(413, 'The dashboard request body is too large.');
  }
  if (size === 0) {
    throw new RequestProblem(400, 'The dashboard request body must contain JSON.');
  }
  const body = Buffer.concat(chunks).toString('utf8');
  if (hasDuplicateTopLevelKeys(body)) {
    throw new RequestProblem(400, 'The dashboard request schema contains a duplicate field.');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new RequestProblem(400, 'The dashboard request body contains malformed JSON.');
  }
}

function hasDuplicateTopLevelKeys(text: string): boolean {
  let index = skipWhitespace(text, 0);
  if (text[index] !== '{') return false;
  index += 1;
  const keys = new Set<string>();

  while (index < text.length) {
    index = skipWhitespace(text, index);
    if (text[index] === '}') return false;
    if (text[index] !== '"') return false;
    const keyEnd = scanJsonString(text, index);
    if (keyEnd < 0) return false;
    let key: unknown;
    try {
      key = JSON.parse(text.slice(index, keyEnd));
    } catch {
      return false;
    }
    if (typeof key !== 'string') return false;
    if (keys.has(key)) return true;
    keys.add(key);

    index = skipWhitespace(text, keyEnd);
    if (text[index] !== ':') return false;
    index = skipJsonValue(text, index + 1);
    if (index < 0) return false;
    index = skipWhitespace(text, index);
    if (text[index] === ',') {
      index += 1;
      continue;
    }
    return false;
  }
  return false;
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && /\s/u.test(text[index]!)) index += 1;
  return index;
}

function scanJsonString(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === '"') return index + 1;
  }
  return -1;
}

function skipJsonValue(text: string, start: number): number {
  let index = skipWhitespace(text, start);
  if (text[index] === '"') return scanJsonString(text, index);
  if (text[index] === '{' || text[index] === '[') {
    const stack: string[] = [text[index] === '{' ? '}' : ']'];
    index += 1;
    while (index < text.length) {
      const character = text[index]!;
      if (character === '"') {
        index = scanJsonString(text, index);
        if (index < 0) return -1;
        continue;
      }
      if (character === '{' || character === '[') {
        stack.push(character === '{' ? '}' : ']');
      } else if (character === '}' || character === ']') {
        if (stack.pop() !== character) return -1;
        if (stack.length === 0) return index + 1;
      }
      index += 1;
    }
    return -1;
  }
  while (index < text.length && !/[\s,}]/u.test(text[index]!)) index += 1;
  return index;
}

function parseAuditRequest(value: unknown): AuditRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestProblem(400, 'The dashboard request schema is invalid.');
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (
    keys.some((key) => key !== 'scenarioId' && key !== 'maxTokens')
    || typeof input['scenarioId'] !== 'string'
  ) {
    throw new RequestProblem(400, 'The dashboard request schema is invalid.');
  }
  const maxTokens = input['maxTokens'];
  if (
    maxTokens !== undefined
    && (!Number.isSafeInteger(maxTokens) || (maxTokens as number) < 1 || (maxTokens as number) > 1_000_000)
  ) {
    throw new RequestProblem(400, 'The context budget must be an integer from 1 through 1000000.');
  }
  return maxTokens === undefined
    ? { scenarioId: input['scenarioId'] }
    : { scenarioId: input['scenarioId'], maxTokens: maxTokens as number };
}

function applySecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  if (response.writableEnded) return;
  const body = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', body.byteLength);
  response.end(body);
}

function statusCodeName(statusCode: number): string {
  switch (statusCode) {
    case 400: return 'INVALID_REQUEST';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 405: return 'METHOD_NOT_ALLOWED';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_MEDIA_TYPE';
    default: return 'REQUEST_ERROR';
  }
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
}

function parsePortArgument(): number {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  if (parsed.values.port === undefined) return DASHBOARD_DEFAULT_PORT;
  if (!/^(?:0|[1-9][0-9]{0,4})$/.test(parsed.values.port)) {
    throw new Error('Dashboard port must be an integer from 0 through 65535.');
  }
  return Number(parsed.values.port);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const dashboard = await startDashboardServer({ port: parsePortArgument() });
    process.stdout.write(`${PRODUCT_NAME} dashboard: ${dashboard.url}\n`);
  } catch {
    process.stderr.write('The local dashboard could not start. Check the port and retry.\n');
    process.exitCode = 1;
  }
}
