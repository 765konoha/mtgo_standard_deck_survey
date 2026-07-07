# Conflict prevention flow

## Cause investigated

The repeated conflicts were caused by generated data being updated on two histories at the same time:

- Feature branches sometimes update generated files such as `public/data/card-search-index.json` after changing parsers, dictionary logic, or event data.
- The `main` branch is also updated by scheduled/manual data workflows:
  - `Fetch MTGO decklists`
  - `Update card dictionary`
- Those workflows rewrite overlapping generated JSON files, especially:
  - `public/data/card-search-index.json`
  - `public/data/index.json`
  - `data/events/*.json`
  - `public/data/events/*.json`
  - `data/cards/*.json`
  - `data/state/events.json`

When both the PR branch and `main` changed the same generated JSON after their merge base, Git could not safely auto-merge the derived output.

## Required flow for PR branches

Before pushing a PR that touches generated data or the scripts that generate it, always sync with the latest `main` and regenerate derived files:

```bash
git fetch origin
git merge origin/main
npm run build:index
npm test
npm run build
git push
```

If the branch updates dictionary output or event JSON translations, also run the relevant generator before `build:index`:

```bash
npm run update:dictionary
npm run rebuild:data
npm run build:index
```

Do not hand-edit conflict markers in generated JSON. Resolve generated-data conflicts by keeping the merged source data, regenerating the derived JSON, then staging the regenerated output.

## Automated guard

`PR conflict guard` runs on pull requests. It compares the PR branch with the base branch and fails when both sides changed the same generated-data file since the merge base.

The same check can be run locally:

```bash
npm run check:conflict-risk -- --base=origin/main
```

When the guard fails, update the branch with `origin/main`, regenerate data, then rerun tests and build.

## Data workflow serialization

The data-writing workflows use the same concurrency group:

```yaml
concurrency:
  group: data-generation-main
  cancel-in-progress: false
```

This queues decklist fetching and card dictionary updates instead of allowing both to write generated data to `main` at the same time. Each workflow also fast-forwards to the latest `main` before generating data.
