/**
 * Tamhees — centralized runtime identity.
 *
 * Runtime, adapter, dashboard, and MCP code import these values instead of
 * scattering product identifiers. Package metadata and .gitignore are the
 * only active identity locations that cannot import this module.
 */

/** Accessible English product name. */
export const PRODUCT_NAME = 'Tamhees' as const;

/** Restrained Arabic-language detail; never substitutes for PRODUCT_NAME. */
export const PRODUCT_ARABIC_NAME = 'تمحيص' as const;

/** Approved short tagline and plain-language explanation. */
export const PRODUCT_TAGLINE = 'Memory under scrutiny.' as const;
export const PRODUCT_EXPLANATION =
  'Tamhees checks what an AI remembers before that memory is allowed to guide an action.' as const;

/** Supported package and executable identity. */
export const CLI_NAME = 'tamhees' as const;

/** Canonical storage directory and the one explicitly migratable legacy name. */
export const STORAGE_DIR = '.tamhees' as const;
export const LEGACY_STORAGE_DIR = '.gptbrain' as const;

/** Engine/auditor identity used in audit events. */
export const ENGINE_AUDITOR = 'tamhees-engine' as const;

/** Prefix for atomic-write temporary files. */
export const ATOMIC_TEMP_PREFIX = '.tamhees-tmp-' as const;

/** Managed adapter identity and project-local filenames. */
export const MANAGED_BLOCK_START = '<!-- TAMHEES:START -->' as const;
export const MANAGED_BLOCK_END = '<!-- TAMHEES:END -->' as const;
export const MANAGED_BLOCK_ORIGIN_PREFIX = '<!-- TAMHEES:ORIGIN=' as const;
export const ANTIGRAVITY_RULE_PATH = '.agents/rules/tamhees.md' as const;
export const GENERIC_AGENT_PATH = 'TAMHEES_AGENT.md' as const;
export const MCP_INSTRUCTION_PATH = 'TAMHEES_MCP.md' as const;

/** Exact pre-release MCP surface. The superseded namespace is not aliased. */
export const TAMHEES_MCP_TOOL_NAMES = [
  'tamhees_initialize_project',
  'tamhees_begin_task',
  'tamhees_finalize_task',
  'tamhees_status',
] as const;

/** Engine version — matches package.json version. */
export const ENGINE_VERSION = '1.0.0-rc.2' as const;

/** Directory rename does not alter the stored artifact schema. */
export const CURRENT_SCHEMA_VERSION = '1.0.0' as const;