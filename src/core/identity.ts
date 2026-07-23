/**
 * Doubtful Memory — Centralized Runtime Identity
 *
 * This module is the single source of truth for all runtime identity values.
 * Import these constants instead of repeating string literals.
 *
 * OWNER DIRECTION: "gptbrain" and ".gptbrain" are temporary internal codenames.
 * A later rename requires a storage migration and compatibility plan.
 * See DM-DEC-026.
 *
 * CONTROLLED RENAME LOCATIONS that cannot import this module:
 *   - package.json: "bin.gptbrain", "name"
 *   - .gitignore: ".gptbrain/" patterns
 *   - tsconfig.json: (no identity references)
 */

/** Product name — the user-facing name of the project. */
export const PRODUCT_NAME = 'Doubtful Memory' as const;

/** CLI binary name — the command users invoke. Temporary codename. */
export const CLI_NAME = 'gptbrain' as const;

/** Storage directory name — the dot-directory for project data. Temporary codename. */
export const STORAGE_DIR = '.gptbrain' as const;

/** Engine/auditor identity string used in audit events. */
export const ENGINE_AUDITOR = 'gptbrain-engine' as const;

/** Prefix for atomic-write temporary files. */
export const ATOMIC_TEMP_PREFIX = '.gptbrain-tmp-' as const;

/** Engine version — matches package.json version. */
export const ENGINE_VERSION = '0.7.0' as const;

/** Current schema version for all stored artifacts. */
export const CURRENT_SCHEMA_VERSION = '1.0.0' as const;
