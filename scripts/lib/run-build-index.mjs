export async function buildIndex() {
  const { buildPublicIndexes } = await import('./build-public-index.mjs');
  return buildPublicIndexes();
}

