import type { Clock, LifecycleBeginResult, LifecycleFinalizeResult } from '../core/types.js';
import type { LifecycleIdGenerator } from '../core/lifecycle.js';

export const ADAPTER_NAMES = ['codex', 'antigravity', 'claude', 'generic', 'mcp'] as const;
export type AdapterName = (typeof ADAPTER_NAMES)[number];
export type AdapterFormat = 'json' | 'markdown';

export interface AdapterDefinition {
  readonly name: AdapterName;
  readonly displayName: string;
  readonly instructionPath: string;
  readonly description: string;
}

export interface AdapterRuntime {
  readonly clock?: Clock;
  readonly idGenerator?: LifecycleIdGenerator;
}

export interface AdapterBeginOptions {
  readonly maxTokens?: number;
}

export interface Adapter {
  readonly definition: AdapterDefinition;
  begin(projectDir: string, task: string, options?: AdapterBeginOptions, runtime?: AdapterRuntime): Promise<LifecycleBeginResult>;
  finalize(projectDir: string, input: unknown, runtime?: AdapterRuntime): Promise<LifecycleFinalizeResult>;
}

export type AdapterInstallState = 'ABSENT' | 'INSTALLED' | 'CORRUPT';

export interface AdapterStatusResult {
  readonly success: boolean;
  readonly agent: AdapterName;
  readonly path: string;
  readonly state: AdapterInstallState;
  readonly managedBlockCount: number;
  readonly errors: readonly string[];
}

export interface AdapterChangeResult extends AdapterStatusResult {
  readonly changed: boolean;
  readonly dryRun: boolean;
  readonly action: 'install' | 'remove';
}
