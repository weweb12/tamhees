import { beginLifecycle, finalizeLifecycle, randomLifecycleId } from '../core/lifecycle.js';
import { systemClock } from '../core/types.js';
import { ANTIGRAVITY_RULE_PATH, GENERIC_AGENT_PATH, MCP_INSTRUCTION_PATH } from '../core/identity.js';
import { ADAPTER_NAMES, type Adapter, type AdapterDefinition, type AdapterName } from './types.js';

const DEFINITIONS: Readonly<Record<AdapterName, AdapterDefinition>> = {
  codex: {
    name: 'codex', displayName: 'Codex', instructionPath: 'AGENTS.md',
    description: 'Project-local Codex instructions.',
  },
  antigravity: {
    name: 'antigravity', displayName: 'Antigravity', instructionPath: ANTIGRAVITY_RULE_PATH,
    description: 'Project-local Antigravity agent rule.',
  },
  claude: {
    name: 'claude', displayName: 'Claude Code', instructionPath: 'CLAUDE.md',
    description: 'Project-local Claude instructions.',
  },
  generic: {
    name: 'generic', displayName: 'Generic agent', instructionPath: GENERIC_AGENT_PATH,
    description: 'Portable project-local agent instructions.',
  },
  mcp: {
    name: 'mcp', displayName: 'Local stdio MCP', instructionPath: MCP_INSTRUCTION_PATH,
    description: 'Project-local MCP configuration example and instructions.',
  },
};

export function isAdapterName(value: string): value is AdapterName {
  return (ADAPTER_NAMES as readonly string[]).includes(value);
}

export function listAdapterDefinitions(): readonly AdapterDefinition[] {
  return ADAPTER_NAMES.map((name) => DEFINITIONS[name]);
}

export function getAdapter(name: AdapterName): Adapter {
  return {
    definition: DEFINITIONS[name],
    async begin(projectDir, task, options = {}, runtime = {}) {
      return beginLifecycle(
        projectDir,
        task,
        runtime.clock ?? systemClock,
        runtime.idGenerator ?? randomLifecycleId,
        options,
      );
    },
    async finalize(projectDir, input, runtime = {}) {
      return finalizeLifecycle(projectDir, input, runtime.clock ?? systemClock);
    },
  };
}
