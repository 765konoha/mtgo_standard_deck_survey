import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('all published JSON files are valid JSON without conflict markers', async () => {
  const files = await collectJsonFiles(join('public', 'data'));
  assert.ok(files.length > 0, 'expected published JSON files');

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /^(?:<<<<<<<|=======|>>>>>>>)/m, `conflict marker in ${file}`);
    assert.doesNotThrow(() => JSON.parse(source), `invalid JSON in ${file}`);
  }
});

async function collectJsonFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(path);
  }
  return files;
}
