import { validTaskScope } from '../core/scope.js';
import { getAdapter } from '../adapters/registry.js';
import { DEFAULT_CONTEXT_MAX_TOKENS } from '../core/types.js';
import { initTamhees, loadAllRecords } from '../core/store.js';
import { loadAllEvidence } from '../core/evidence.js';
import { systemClock } from '../core/types.js';
import { PRODUCT_NAME, TAMHEES_MCP_TOOL_NAMES } from '../core/identity.js';
import { McpInvalidParamsError, McpToolNotFoundError, type McpToolDefinition, type McpToolProvider, type McpToolResult } from './protocol.js';

export const MCP_TOOL_NAMES = TAMHEES_MCP_TOOL_NAMES;

const EMPTY_SCHEMA = { type: 'object', properties: {}, additionalProperties: false } as const;
const TOOLS: readonly McpToolDefinition[] = [
  { name: MCP_TOOL_NAMES[0], description: `Initialize local ${PRODUCT_NAME} storage in this project.`, inputSchema: EMPTY_SCHEMA },
  { name: MCP_TOOL_NAMES[1], description: 'Begin a controlled task and return ephemeral ranked context.', inputSchema: {
    type: 'object', properties: { scope: { type: 'object', properties: { environment: { type: 'string' }, component: { type: 'string' }, path: { type: 'string' } }, additionalProperties: false }, task: { type: 'string' }, maxTokens: { type: 'integer', minimum: 1, maximum: 1_000_000 } }, required: ['task'], additionalProperties: false,
  } },
  { name: MCP_TOOL_NAMES[2], description: 'Finalize with proposedUpdates and optional proposedEvidence through the canonical lifecycle policy boundary; evidence and new verified memories can be submitted together.', inputSchema: {
    type: 'object', properties: { input: { type: 'object' } }, required: ['input'], additionalProperties: false,
  } },
  { name: MCP_TOOL_NAMES[3], description: 'Return privacy-safe local storage counts and readiness.', inputSchema: EMPTY_SCHEMA },
];

export function createMcpTools(projectDir: string): McpToolProvider {
  const adapter = getAdapter('mcp');
  return {
    list: () => TOOLS,
    async call(name: string, args: unknown): Promise<McpToolResult> {
      if (!isObject(args)) throw new McpInvalidParamsError();
      let result: unknown;
      if (name === MCP_TOOL_NAMES[0]) {
        requireKeys(args, []);
        result = await initTamhees(projectDir, systemClock);
      } else if (name === MCP_TOOL_NAMES[1]) {
        requireKeys(args, ['task', 'maxTokens', 'scope']);
        if (typeof args['task'] !== 'string' || args['task'].trim().length === 0) throw new McpInvalidParamsError();
        const maxTokens = args['maxTokens'] === undefined ? DEFAULT_CONTEXT_MAX_TOKENS : args['maxTokens'];
        if (!Number.isSafeInteger(maxTokens) || (maxTokens as number) < 1 || (maxTokens as number) > 1_000_000) throw new McpInvalidParamsError();
        if (args['scope'] !== undefined && !validTaskScope(args['scope'])) throw new McpInvalidParamsError();
        result = await adapter.begin(projectDir, args['task'], { maxTokens: maxTokens as number, scope: (args['scope'] ?? {}) as import('../core/types.js').TaskScope });
      } else if (name === MCP_TOOL_NAMES[2]) {
        requireKeys(args, ['input']);
        if (!isObject(args['input'])) throw new McpInvalidParamsError();
        result = await adapter.finalize(projectDir, args['input']);
      } else if (name === MCP_TOOL_NAMES[3]) {
        requireKeys(args, []);
        const records = await loadAllRecords(projectDir);
        const evidence = await loadAllEvidence(projectDir);
        result = {
          ready: records.errors.length === 0 && evidence.errors.length === 0,
          memoryCount: records.records.length,
          evidenceCount: evidence.evidence.length,
          errorCount: records.errors.length + evidence.errors.length,
        };
      } else throw new McpToolNotFoundError();
      const failed = isObject(result) && result['success'] === false;
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
        ...(failed ? { isError: true } : {}),
      };
    },
  };
}

function requireKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new McpInvalidParamsError();
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
