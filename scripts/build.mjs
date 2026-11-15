import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [license, source] = await Promise.all([
  readFile(new URL('LICENSE', root), 'utf8'),
  readFile(new URL('src/main.js', root), 'utf8'),
]);
await writeFile(new URL('main.js', root), `/*!\n${license.trimEnd()}\n*/\n${source}`);
