import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

// Raw event pages are kept for re-parsing after parser fixes, gzip-compressed
// to keep the repository small. Node writes a zero mtime in the gzip header,
// so the same HTML always produces identical bytes (no spurious git diffs).
export function compressHtml(html) {
  return gzipSync(Buffer.from(html, 'utf8'), { level: 9 });
}

export function decompressHtml(buffer) {
  return gunzipSync(buffer).toString('utf8');
}

export async function writeGzipAtomic(path, html) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, compressHtml(html));
  await rename(temp, path);
}

export async function readRawHtml(path) {
  return decompressHtml(await readFile(path));
}

// Converts any uncompressed `<id>.html` left from older runs into
// `<id>.html.gz`. Returns the number of files converted.
export async function compressLegacyRawHtml(directory) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (error && error.code === 'ENOENT') return 0;
    throw error;
  }
  let converted = 0;
  for (const name of entries) {
    if (!name.endsWith('.html')) continue;
    const source = join(directory, name);
    await writeGzipAtomic(`${source}.gz`, await readFile(source, 'utf8'));
    await unlink(source);
    converted += 1;
  }
  return converted;
}
