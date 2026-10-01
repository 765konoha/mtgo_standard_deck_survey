import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  compressHtml,
  compressLegacyRawHtml,
  readRawHtml,
  writeGzipAtomic,
} from '../scripts/lib/raw-html.mjs';

test('gzip output is deterministic so unchanged pages produce no git diff', () => {
  const html = '<html><body>Standard Challenge 繁殖池</body></html>';
  assert.deepEqual(compressHtml(html), compressHtml(html));
});

test('raw HTML round-trips through the gzip file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mtgo-raw-'));
  const path = join(dir, 'event.html.gz');
  await writeGzipAtomic(path, '<p>日本語</p>');
  assert.equal(await readRawHtml(path), '<p>日本語</p>');
});

test('legacy .html files are replaced by .html.gz', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mtgo-raw-legacy-'));
  await writeFile(join(dir, 'a.html'), '<p>a</p>', 'utf8');
  await writeFile(join(dir, 'b.html.gz'), compressHtml('<p>b</p>'));
  assert.equal(await compressLegacyRawHtml(dir), 1);
  assert.deepEqual((await readdir(dir)).sort(), ['a.html.gz', 'b.html.gz']);
  assert.equal(await readRawHtml(join(dir, 'a.html.gz')), '<p>a</p>');
  assert.ok((await readFile(join(dir, 'a.html.gz'))).length > 0);
  assert.equal(await compressLegacyRawHtml(join(dir, 'missing')), 0);
});
