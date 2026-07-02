import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const testFiles = await findTestFiles('tests');

if (testFiles.length === 0) {
  throw new Error('No .test.mjs files found under tests');
}

const child = spawn(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

async function findTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return findTestFiles(path);
      if (entry.isFile() && entry.name.endsWith('.test.mjs')) return [path];
      return [];
    })
  );
  return files.flat().sort();
}
