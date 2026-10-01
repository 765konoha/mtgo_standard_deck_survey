// Some Japanese printings (e.g. EOE, TRK) carry furigana in Scryfall's
// printed_name as "漢字（よみ）" pairs, e.g. "繁（はん）殖（しょく）池（いけ）".
// Only a hiragana reading directly after a kanji is removed, so other
// parenthesised text is left untouched.
const FURIGANA_PATTERN = /([\p{Script=Han}々〆ヵヶ])[（(][\p{Script=Hiragana}ー]+[）)]/gu;

export function stripFurigana(name) {
  if (typeof name !== 'string') return name;
  return name.replace(FURIGANA_PATTERN, '$1');
}
