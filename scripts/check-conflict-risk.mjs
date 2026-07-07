import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GENERATED_DATA_PREFIXES = [
  'data/cards/',
  'data/events/',
  'data/raw/events/',
  'public/data/',
];

const GENERATED_DATA_FILES = new Set([
  'data/state/events.json',
]);

export function isGeneratedDataPath(filePath) {
  const normalized = normalizePath(filePath);
  return GENERATED_DATA_FILES.has(normalized)
    || GENERATED_DATA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(normalizePath))].sort((a, b) => a.localeCompare(b));
}

export function findGeneratedConflictRisk({ baseChangedFiles, headChangedFiles }) {
  const baseGenerated = uniqueSorted(baseChangedFiles).filter(isGeneratedDataPath);
  const headGenerated = uniqueSorted(headChangedFiles).filter(isGeneratedDataPath);
  const baseSet = new Set(baseGenerated);
  const overlappingGenerated = headGenerated.filter((file) => baseSet.has(file));

  return {
    baseGenerated,
    headGenerated,
    overlappingGenerated,
    hasRisk: overlappingGenerated.length > 0,
  };
}

export function formatRiskReport({
  baseRef,
  headRef,
  mergeBase,
  risk,
}) {
  const lines = [
    `[CONFLICT GUARD] base: ${baseRef}`,
    `[CONFLICT GUARD] head: ${headRef}`,
    `[CONFLICT GUARD] merge-base: ${mergeBase}`,
    `[CONFLICT GUARD] generated files changed on base: ${risk.baseGenerated.length}`,
    `[CONFLICT GUARD] generated files changed on head: ${risk.headGenerated.length}`,
    `[CONFLICT GUARD] overlapping generated files: ${risk.overlappingGenerated.length}`,
  ];

  for (const file of risk.overlappingGenerated) {
    lines.push(`[CONFLICT GUARD] overlap: ${file}`);
  }

  if (risk.hasRisk) {
    lines.push('');
    lines.push('Generated data changed on both the PR branch and the base branch.');
    lines.push('Sync the branch with the latest main, regenerate derived data, then run verification:');
    lines.push('  git fetch origin');
    lines.push('  git merge origin/main');
    lines.push('  npm run build:index');
    lines.push('  npm test');
    lines.push('  npm run build');
  } else {
    lines.push('[CONFLICT GUARD] no overlapping generated-data conflict risk detected');
  }

  return lines.join('\n');
}

export function parseArgs(argv) {
  const options = {
    base: 'origin/main',
    head: 'HEAD',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') {
      options.base = argv[i + 1] || options.base;
      i += 1;
    } else if (arg.startsWith('--base=')) {
      options.base = arg.slice('--base='.length) || options.base;
    } else if (arg === '--head') {
      options.head = argv[i + 1] || options.head;
      i += 1;
    } else if (arg.startsWith('--head=')) {
      options.head = arg.slice('--head='.length) || options.head;
    }
  }

  return options;
}

function normalizePath(filePath) {
  return String(filePath).replaceAll('\\', '/').replace(/^\.?\//, '');
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitFiles(args) {
  const output = git(args);
  if (!output) return [];
  return output.split(/\r?\n/).filter(Boolean);
}

function runCli() {
  const { base, head } = parseArgs(process.argv.slice(2));
  const mergeBase = git(['merge-base', head, base]);
  const baseChangedFiles = gitFiles(['diff', '--name-only', mergeBase, base]);
  const headChangedFiles = gitFiles(['diff', '--name-only', mergeBase, head]);
  const risk = findGeneratedConflictRisk({ baseChangedFiles, headChangedFiles });
  const report = formatRiskReport({
    baseRef: base,
    headRef: head,
    mergeBase,
    risk,
  });

  if (risk.hasRisk && process.env.GITHUB_ACTIONS === 'true') {
    console.error(`::error title=Generated data conflict risk::${risk.overlappingGenerated.join(', ')}`);
  }
  console.log(report);

  if (risk.hasRisk) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
