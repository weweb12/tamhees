/**
 * Tamhees — `tamhees observe` against a real project directory.
 *
 * Loads the store, collects repository facts, runs the pure observer and (with
 * --record) stores the findings as evidence under the project write lock. Kept apart
 * from observe.ts so the pure observer can run in the browser demo.
 */

import { join, resolve } from 'node:path';
import { verifyPathSafety } from './atomic-write.js';
import { loadAllEvidence, storeEvidenceRecord } from './evidence.js';
import { withWriteLock } from './lock.js';
import {
  collectRepositoryFacts,
  existsSafely,
  mentionedPaths,
  observationToEvidence,
  observeRecords,
  type ObserveResult,
} from './observe.js';
import { loadAllRecords } from './store.js';
import type { Clock } from './types.js';

export async function observeProject(projectDir: string, clock: Clock, record: boolean): Promise<ObserveResult> {
  return record
    ? withWriteLock(projectDir, () => observeProjectUnlocked(projectDir, clock, true))
    : observeProjectUnlocked(projectDir, clock, false);
}

async function observeProjectUnlocked(projectDir: string, clock: Clock, record: boolean): Promise<ObserveResult> {
  const root = resolve(projectDir);
  const loaded = await loadAllRecords(root);
  if (loaded.errors.length > 0) return { success: false, report: null, recorded: [], alreadyRecorded: [], errors: loaded.errors };
  const existing = await loadAllEvidence(root);
  if (existing.errors.length > 0) return { success: false, report: null, recorded: [], alreadyRecorded: [], errors: existing.errors };

  const facts = await collectRepositoryFacts(root);
  const pathChecks = new Map<string, boolean>();
  for (const raw of loaded.records) {
    for (const path of mentionedPaths(raw.statement)) {
      if (!pathChecks.has(path)) {
        const target = join(root, path);
        const safety = await verifyPathSafety(target, root);
        if (safety.safe) pathChecks.set(path, await existsSafely(root, path));
      }
    }
  }

  const now = clock();
  const report = observeRecords(loaded.records, facts, pathChecks, now);
  const known = new Set(existing.evidence.map((item) => item.id));
  const recorded: string[] = [];
  const alreadyRecorded: string[] = [];
  const errors: string[] = [];
  for (const item of report.observations) {
    if (known.has(item.evidenceId)) {
      alreadyRecorded.push(item.evidenceId);
      continue;
    }
    if (!record) continue;
    const stored = await storeEvidenceRecord(root, observationToEvidence(item, now));
    if (stored.success) recorded.push(item.evidenceId);
    else errors.push(...stored.errors.map((issue) => `${item.evidenceId}: [${issue.code}] ${issue.message}`));
  }
  return { success: errors.length === 0, report, recorded, alreadyRecorded, errors };
}

