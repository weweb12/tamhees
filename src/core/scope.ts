/** Deterministic applicability, separate from lexical relevance and authority. */
import type { MemoryScope, TaskScope } from './types.js';
import { scanSecretLikeText } from './privacy.js';

export function validTaskScope(value: unknown): value is TaskScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['environment', 'component', 'path'].includes(k))) return false;
  for (const key of ['environment', 'component']) {
    if (v[key] !== undefined && (typeof v[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(v[key] as string))) return false;
  }
  if (v['path'] !== undefined && (typeof v['path'] !== 'string' || (v['path'] as string).length > 256 || !(v['path'] as string).split('/').every(p => /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(p) && p !== '.' && p !== '..'))) return false;
  return !scanSecretLikeText(Object.values(v).filter((x): x is string => typeof x === 'string')).secretLike;
}
export function validMemoryScope(value: unknown): value is MemoryScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { kind, ...constraints } = value as Record<string, unknown>;
  if (kind === 'PROJECT') return Object.keys(constraints).length === 0;
  return kind === 'RESTRICTED' && Object.values(constraints).some(v => v !== undefined) && validTaskScope(constraints);
}
export function scopeMatches(scope: MemoryScope, task: TaskScope): boolean {
  if (!validMemoryScope(scope) || !validTaskScope(task)) return false;
  if (scope.kind === 'PROJECT') return true;
  return (scope.environment === undefined || scope.environment === task.environment)
    && (scope.component === undefined || scope.component === task.component)
    && (scope.path === undefined || (task.path !== undefined && (task.path === scope.path || task.path.startsWith(scope.path + '/'))));
}
/** Schema 1.0 records predate applicability. Missing scope means the same local project. */
export function normalizeLegacyMemory<T extends object>(record: T): T & { scope: MemoryScope } {
  return { ...record, scope: ('scope' in record ? record.scope : { kind: 'PROJECT' }) as MemoryScope };
}
