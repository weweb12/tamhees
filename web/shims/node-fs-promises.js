// Browser stand-in for node:fs/promises used only by the hosted demo.
// The hosted demo never reads or writes files; any attempt fails loudly.

function unavailable() {
  return Promise.reject(new Error('Hosted demo: file storage is not available in the browser.'));
}

export const lstat = unavailable;
export const mkdir = unavailable;
export const readFile = unavailable;
export const readdir = unavailable;
export const rename = unavailable;
export const stat = unavailable;
export const unlink = unavailable;
export const writeFile = unavailable;
