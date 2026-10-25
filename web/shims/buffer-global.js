// Browser stand-in for the one Node global the engine uses: Buffer.byteLength(text, 'utf8'),
// which the context budget uses as its dependency-free UTF-8 byte estimator.
// TextEncoder produces the same UTF-8 byte count, so budgets match the local engine exactly.

if (typeof globalThis.Buffer === 'undefined') {
  const encoder = new TextEncoder();
  globalThis.Buffer = Object.freeze({
    byteLength(text, encoding = 'utf8') {
      if (encoding !== 'utf8' && encoding !== 'utf-8') {
        throw new Error('Hosted demo: only UTF-8 byte length is supported.');
      }
      return encoder.encode(String(text)).byteLength;
    },
  });
}
