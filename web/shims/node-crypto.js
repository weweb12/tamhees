// Browser stand-in for node:crypto used only by the hosted demo.
// The demo path (audit + context compilation) never hashes; randomBytes is provided via
// Web Crypto so any incidental ID generation still works.

export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return {
    toString(encoding) {
      if (encoding !== 'hex') throw new Error('Hosted demo: only hex encoding is supported.');
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    },
  };
}

export function createHash() {
  throw new Error('Hosted demo: hashing is not used in the browser demonstration.');
}
