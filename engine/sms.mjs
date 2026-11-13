// SMS length and encoding (GSM-7 vs UCS-2), so every text's segment count is known
// before Twilio bills it. One curly apostrophe or em dash switches the whole
// message to UCS-2: 70 characters per single SMS instead of 160.

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';

const basic = new Set([...GSM_BASIC]);
const ext = new Set([...GSM_EXT]);

export function isGsm7(text) {
  for (const ch of text) if (!basic.has(ch) && !ext.has(ch)) return false;
  return true;
}

/** Characters that force UCS-2, with their positions. */
export function nonGsmChars(text) {
  const out = [];
  let i = 0;
  for (const ch of text) {
    if (!basic.has(ch) && !ext.has(ch)) out.push({ ch, index: i, code: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') });
    i++;
  }
  return out;
}

/** Exact segment count: an escape pair or a surrogate pair is never split across segments. */
export function smsSegments(text) {
  if (isGsm7(text)) {
    const units = [...text].map((ch) => (ext.has(ch) ? 2 : 1));
    const total = units.reduce((a, b) => a + b, 0);
    if (total <= 160) return { encoding: 'GSM-7', units: total, segments: total === 0 ? 0 : 1, perSegment: 160 };
    let segments = 1, used = 0;
    for (const u of units) {
      if (used + u > 153) { segments++; used = 0; }
      used += u;
    }
    return { encoding: 'GSM-7', units: total, segments, perSegment: 153 };
  }
  const chars = [...text].map((ch) => ch.length); // UTF-16 code units per character
  const total = chars.reduce((a, b) => a + b, 0);
  if (total <= 70) return { encoding: 'UCS-2', units: total, segments: 1, perSegment: 70 };
  let segments = 1, used = 0;
  for (const u of chars) {
    if (used + u > 67) { segments++; used = 0; }
    used += u;
  }
  return { encoding: 'UCS-2', units: total, segments, perSegment: 67 };
}

const REPLACEMENTS = new Map([
  ['‘', "'"], ['’', "'"], ['‚', "'"], ['‛', "'"],
  ['“', '"'], ['”', '"'], ['„', '"'],
  ['–', '-'], ['—', '-'], ['−', '-'],
  ['…', '...'], [' ', ' '], ['•', '-'],
]);

/** Swap the usual phone-keyboard punctuation for plain characters before sending. */
export function toGsmSafe(text) {
  let out = '';
  for (const ch of text) out += REPLACEMENTS.has(ch) ? REPLACEMENTS.get(ch) : ch;
  return out;
}
