export function normalizeCardName(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc\uFF07]/g, "'")
    .replace(/[\u2010-\u2015\u2212\uFF0D]/g, '-')
    .replace(/\s*\/\/\s*/g, ' // ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

