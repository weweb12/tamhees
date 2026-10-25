import { ENGINE_VERSION, PRODUCT_NAME } from '../core/identity.js';

export const MCP_PROTOCOL_VERSION = '2025-11-25' as const;
/**
 * Protocol revisions this server can speak. The four-tool surface (initialize, ping,
 * tools/list, tools/call with text content) is unchanged across them. Per the MCP
 * lifecycle rules, a client asking for a listed revision gets that revision; any other
 * request is answered with the latest revision and the client decides whether to continue.
 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const MCP_MAX_LINE_BYTES = 1_048_576;
export const MCP_DUPLICATE_ID_WINDOW = 4_096;

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface McpToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface McpToolProvider {
  list(): readonly McpToolDefinition[];
  call(name: string, args: unknown): Promise<McpToolResult>;
}

type RpcId = string | number;
type RpcResponse = Readonly<Record<string, unknown>>;

export class McpSession {
  private initialized = false;
  private ready = false;
  private readonly seenIds = new Set<string>();
  private readonly seenIdOrder: string[] = [];

  public constructor(
    private readonly tools: McpToolProvider,
    private readonly duplicateIdWindow = MCP_DUPLICATE_ID_WINDOW,
  ) {
    if (!Number.isSafeInteger(duplicateIdWindow) || duplicateIdWindow < 1) {
      throw new RangeError('Duplicate request ID window must be a positive safe integer.');
    }
  }

  public async receiveLine(line: string): Promise<string | null> {
    let value: unknown;
    try { value = JSON.parse(line); }
    catch { return encode(errorResponse(null, -32700, 'Parse error')); }

    if (!isObject(value)) return encode(errorResponse(null, -32600, 'Invalid Request'));
    const notification = !Object.prototype.hasOwnProperty.call(value, 'id');
    const id = validId(value['id']) ? value['id'] : null;
    if (!notification && id === null) return encode(errorResponse(null, -32600, 'Invalid Request'));
    if (value['jsonrpc'] !== '2.0' || typeof value['method'] !== 'string') {
      return notification ? null : encode(errorResponse(id, -32600, 'Invalid Request'));
    }

    if (!notification && !this.acceptRequestId(id!)) {
      return encode(errorResponse(id, -32600, 'Duplicate request id'));
    }

    const method = value['method'];
    const params = value['params'];
    if (notification) {
      if (
        method === 'notifications/initialized'
        && this.initialized
        && (params === undefined || isObject(params))
      ) {
        this.ready = true;
      }
      return null;
    }

    if (method === 'ping') {
      if (params !== undefined && !isExactObject(params, ['_meta'])) return encode(errorResponse(id, -32602, 'Invalid params'));
      return encode(resultResponse(id!, {}));
    }
    if (method === 'initialize') {
      if (this.initialized || !validInitializeParams(params)) return encode(errorResponse(id, -32602, 'Invalid params'));
      const requested = params['protocolVersion'] as string;
      const negotiated = MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSION;
      this.initialized = true;
      return encode(resultResponse(id!, {
        protocolVersion: negotiated,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: PRODUCT_NAME, version: ENGINE_VERSION },
      }));
    }
    if (!this.initialized || !this.ready) return encode(errorResponse(id, -32600, 'Server is not initialized'));
    if (method === 'tools/list') {
      // The tool list is never paginated, so a cursor (if any) is accepted and ignored.
      if (params !== undefined && !isExactObject(params, ['cursor', '_meta'])) return encode(errorResponse(id, -32602, 'Invalid params'));
      return encode(resultResponse(id!, { tools: this.tools.list() }));
    }
    if (method === 'tools/call') {
      if (
        !isExactObject(params, ['name', 'arguments', '_meta'])
        || typeof params['name'] !== 'string'
        || (params['arguments'] !== undefined && !isObject(params['arguments']))
      ) {
        return encode(errorResponse(id, -32602, 'Invalid params'));
      }
      try {
        const result = await this.tools.call(params['name'], params['arguments'] ?? {});
        return encode(resultResponse(id!, result));
      } catch (error: unknown) {
        if (error instanceof McpInvalidParamsError) return encode(errorResponse(id, -32602, 'Invalid params'));
        if (error instanceof McpToolNotFoundError) return encode(errorResponse(id, -32602, 'Unknown tool'));
        return encode(errorResponse(id, -32603, 'Internal error'));
      }
    }
    return encode(errorResponse(id, -32601, 'Method not found'));
  }

  /**
   * Duplicate IDs are rejected only within a bounded rolling window. Once the
   * oldest ID is evicted, a client may safely reuse it without unbounded state.
   */
  private acceptRequestId(id: RpcId): boolean {
    const key = `${typeof id}:${String(id)}`;
    if (this.seenIds.has(key)) return false;
    if (this.seenIdOrder.length === this.duplicateIdWindow) {
      const oldest = this.seenIdOrder.shift()!;
      this.seenIds.delete(oldest);
    }
    this.seenIds.add(key);
    this.seenIdOrder.push(key);
    return true;
  }
}

export class McpInvalidParamsError extends Error {}
export class McpToolNotFoundError extends Error {}

export type McpFrame = { readonly line: Buffer } | { readonly error: 'LINE_TOO_LARGE' };

/** Byte-oriented line framing preserves fragmented UTF-8 until a complete line arrives. */
export class McpLineFramer {
  private pending = Buffer.alloc(0);
  private discardingOversize = false;

  public push(chunk: Buffer): readonly McpFrame[] {
    const frames: McpFrame[] = [];
    let cursor = 0;
    while (cursor < chunk.length) {
      const newline = chunk.indexOf(0x0a, cursor);
      const end = newline < 0 ? chunk.length : newline;
      const piece = chunk.subarray(cursor, end);
      if (!this.discardingOversize) {
        if (piece.length > MCP_MAX_LINE_BYTES - this.pending.length) {
          this.pending = Buffer.alloc(0);
          this.discardingOversize = true;
          frames.push({ error: 'LINE_TOO_LARGE' });
        } else if (piece.length > 0) {
          this.pending = Buffer.concat([this.pending, piece]);
        }
      }
      if (newline >= 0) {
        if (!this.discardingOversize) frames.push({ line: stripCarriageReturn(this.pending) });
        this.pending = Buffer.alloc(0);
        this.discardingOversize = false;
        cursor = newline + 1;
      } else {
        cursor = chunk.length;
      }
    }
    return frames;
  }

  /** Process one final unterminated line at clean EOF; an empty EOF is silent. */
  public finish(): readonly McpFrame[] {
    if (this.discardingOversize) {
      this.discardingOversize = false;
      this.pending = Buffer.alloc(0);
      return [];
    }
    if (this.pending.length === 0) return [];
    const line = stripCarriageReturn(this.pending);
    this.pending = Buffer.alloc(0);
    return [{ line }];
  }
}

export function decodeMcpLine(bytes: Buffer): string | null {
  if (bytes.length === 0) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return null; }
}

export function parseErrorLine(): string { return encode(errorResponse(null, -32700, 'Parse error')); }

// Strict, but only against the MCP schema: the optional fields the specification
// defines (`_meta`; clientInfo `title`, `websiteUrl`, `icons`, `description`) are
// accepted because real clients send them. Anything else is still rejected.
const INITIALIZE_PARAM_KEYS = ['protocolVersion', 'capabilities', 'clientInfo', '_meta'] as const;
const CLIENT_INFO_KEYS = ['name', 'version', 'title', 'websiteUrl', 'icons', 'description'] as const;
function validInitializeParams(value: unknown): value is Record<string, unknown> {
  if (!isExactObject(value, INITIALIZE_PARAM_KEYS)) return false;
  const clientInfo = value['clientInfo'];
  return typeof value['protocolVersion'] === 'string'
    && value['protocolVersion'].length > 0
    && isObject(value['capabilities'])
    && isExactObject(clientInfo, CLIENT_INFO_KEYS)
    && typeof clientInfo['name'] === 'string'
    && clientInfo['name'].length > 0
    && typeof clientInfo['version'] === 'string'
    && clientInfo['version'].length > 0;
}
function validId(value: unknown): value is RpcId {
  return (typeof value === 'string' && value.length > 0)
    || (typeof value === 'number' && Number.isSafeInteger(value));
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isExactObject(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}
function stripCarriageReturn(line: Buffer): Buffer {
  return line.length > 0 && line[line.length - 1] === 0x0d ? line.subarray(0, line.length - 1) : line;
}
function resultResponse(id: RpcId, result: unknown): RpcResponse { return { jsonrpc: '2.0', id, result }; }
function errorResponse(id: RpcId | null, code: number, message: string): RpcResponse { return { jsonrpc: '2.0', id, error: { code, message } }; }
function encode(value: RpcResponse): string { return JSON.stringify(value); }
