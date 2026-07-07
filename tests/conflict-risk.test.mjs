import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findGeneratedConflictRisk,
  formatRiskReport,
  isGeneratedDataPath,
  parseArgs,
} from '../scripts/check-conflict-risk.mjs';

test('classifies generated data paths that frequently conflict', () => {
  assert.equal(isGeneratedDataPath('public/data/card-search-index.json'), true);
  assert.equal(isGeneratedDataPath('public/data/events/example.json'), true);
  assert.equal(isGeneratedDataPath('data/events/example.json'), true);
  assert.equal(isGeneratedDataPath('data/cards/en-ja-map.json'), true);
  assert.equal(isGeneratedDataPath('data/raw/events/example.html'), true);
  assert.equal(isGeneratedDataPath('data/state/events.json'), true);
  assert.equal(isGeneratedDataPath('scripts/lib/parse-event-page.mjs'), false);
  assert.equal(isGeneratedDataPath('src/App.tsx'), false);
});

test('detects overlapping generated files changed on both base and head', () => {
  const risk = findGeneratedConflictRisk({
    baseChangedFiles: [
      'public/data/card-search-index.json',
      'data/events/new-main.json',
      'src/App.tsx',
    ],
    headChangedFiles: [
      'public/data/card-search-index.json',
      'scripts/lib/parse-event-page.mjs',
      'tests/parse-event-page.test.mjs',
    ],
  });

  assert.equal(risk.hasRisk, true);
  assert.deepEqual(risk.overlappingGenerated, ['public/data/card-search-index.json']);
  assert.deepEqual(risk.baseGenerated, [
    'data/events/new-main.json',
    'public/data/card-search-index.json',
  ]);
  assert.deepEqual(risk.headGenerated, ['public/data/card-search-index.json']);
});

test('does not flag unrelated generated files as direct conflict risk', () => {
  const risk = findGeneratedConflictRisk({
    baseChangedFiles: ['data/events/new-main.json', 'public/data/index.json'],
    headChangedFiles: ['data/events/new-head.json', 'scripts/lib/build-public-index.mjs'],
  });

  assert.equal(risk.hasRisk, false);
  assert.deepEqual(risk.overlappingGenerated, []);
});

test('normalizes windows paths and deduplicates conflict report entries', () => {
  const risk = findGeneratedConflictRisk({
    baseChangedFiles: [
      '.\\public\\data\\card-search-index.json',
      'public/data/card-search-index.json',
    ],
    headChangedFiles: ['./public/data/card-search-index.json'],
  });

  assert.equal(risk.hasRisk, true);
  assert.deepEqual(risk.overlappingGenerated, ['public/data/card-search-index.json']);
});

test('prints the required branch sync and regeneration flow when risk exists', () => {
  const report = formatRiskReport({
    baseRef: 'origin/main',
    headRef: 'HEAD',
    mergeBase: 'abc123',
    risk: {
      baseGenerated: ['public/data/card-search-index.json'],
      headGenerated: ['public/data/card-search-index.json'],
      overlappingGenerated: ['public/data/card-search-index.json'],
      hasRisk: true,
    },
  });

  assert.match(report, /overlap: public\/data\/card-search-index\.json/);
  assert.match(report, /git merge origin\/main/);
  assert.match(report, /npm run build:index/);
  assert.match(report, /npm test/);
  assert.match(report, /npm run build/);
});

test('parses base and head options in both supported forms', () => {
  assert.deepEqual(parseArgs([]), { base: 'origin/main', head: 'HEAD' });
  assert.deepEqual(parseArgs(['--base', 'upstream/main', '--head', 'feature']), {
    base: 'upstream/main',
    head: 'feature',
  });
  assert.deepEqual(parseArgs(['--base=origin/develop', '--head=abc123']), {
    base: 'origin/develop',
    head: 'abc123',
  });
});
