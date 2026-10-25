// Minimal POSIX-style stand-in for node:path used only by the hosted demo.
// The demo path does not touch the filesystem; these exist so engine modules link.

export const sep = '/';

function normalize(path) {
  const absolute = path.startsWith('/');
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (!absolute) parts.push('..');
    } else {
      parts.push(part);
    }
  }
  return (absolute ? '/' : '') + parts.join('/') || (absolute ? '/' : '.');
}

export function join(...parts) {
  return normalize(parts.filter((part) => part !== '').join('/'));
}

export function resolve(...parts) {
  let path = '';
  for (let index = parts.length - 1; index >= 0 && !path.startsWith('/'); index -= 1) {
    path = path === '' ? parts[index] : `${parts[index]}/${path}`;
  }
  return normalize(path.startsWith('/') ? path : `/${path}`);
}

export function isAbsolute(path) {
  return path.startsWith('/');
}

export function dirname(path) {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  return index === 0 ? '/' : normalized.slice(0, index);
}

export function basename(path, ext) {
  const base = normalize(path).split('/').pop() ?? '';
  return ext !== undefined && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

export function extname(path) {
  const base = basename(path);
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(index) : '';
}

export function relative(from, to) {
  const a = resolve(from).split('/').filter(Boolean);
  const b = resolve(to).split('/').filter(Boolean);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
  return [...Array(a.length - shared).fill('..'), ...b.slice(shared)].join('/');
}
