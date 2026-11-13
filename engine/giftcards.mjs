// Gift cards (blueprint Screen 12, pages 14 and 33-34).
//
// Code: "FL-" plus 6 letters/digits, e.g. FL-7K2Q9P. Redeem accepts only a
// code from a card actually sold, only once; normalise first (capitals, no
// spaces). Money is whole cents here.

// No 0/O, 1/I/L: a code read over the phone or off a printed card cannot be
// misread. Both blueprint samples (FL-7K2Q9P, FL-3M8XTD) fit this alphabet.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;
export const CODE_SPACE = CODE_ALPHABET.length ** CODE_LENGTH; // 887,503,681

const LIMIT = 256 - (256 % CODE_ALPHABET.length); // rejection sampling: no modulo bias

export function randomCodeBody(randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const b of randomBytes(16)) {
      if (b < LIMIT) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

export function generateCode(prefix = 'FL', randomBytes) {
  return `${prefix}-${randomCodeBody(randomBytes)}`;
}

/**
 * "fl 7k2q9p", "FL7K2Q9P", " fl-7k2q-9p " -> "FL-7K2Q9P".
 * Returns null when the text cannot be a code at all (wrong length, a 0/O/1/I/L).
 */
export function normalizeCode(input, prefix = 'FL') {
  const s = String(input ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
  let body;
  if (s.length === CODE_LENGTH) body = s; // typed without the prefix
  else if (s.length === prefix.length + CODE_LENGTH && s.startsWith(prefix)) body = s.slice(prefix.length);
  else return null;
  for (const ch of body) if (!CODE_ALPHABET.includes(ch)) return null;
  return `${prefix}-${body}`;
}

/** Probability that at least two of n random codes collide (birthday bound). */
export function collisionProbability(n, space = CODE_SPACE) {
  // 1 - exp(-n(n-1)/2N), computed stably
  return -Math.expm1((-n * (n - 1)) / (2 * space));
}

export const GIFT_AMOUNTS_CENTS = [2500, 5000, 7500, 10000, 15000, 20000];

/** Feather Lady's starting switches: every amount ON except $200, custom ON, both cleans ON. */
export const FEATHER_GIFT_SWITCHES = Object.freeze({
  giftAmountsOn: [2500, 5000, 7500, 10000, 15000],
  giftCustomEnabled: true,
  giftStandardCleanEnabled: true,
  giftDeepCleanEnabled: true,
});

/** The options the sell form and Client View show - an OFF option is absent, never greyed out. */
export function giftOptions(switches, pricing) {
  const opts = GIFT_AMOUNTS_CENTS.filter((c) => switches.giftAmountsOn.includes(c)).map((c) => ({
    kind: 'amount', amountCents: c, label: `Gift card - $${c / 100}`,
  }));
  if (switches.giftCustomEnabled) opts.push({ kind: 'custom', amountCents: null, label: 'Gift card - custom amount' });
  if (switches.giftStandardCleanEnabled)
    opts.push({ kind: 'standard', amountCents: pricing.base.Standard, label: `One Standard Clean - $${pricing.base.Standard / 100}` });
  if (switches.giftDeepCleanEnabled)
    opts.push({ kind: 'deep', amountCents: pricing.base.Deep, label: `One Deep Clean - $${pricing.base.Deep / 100}` });
  return opts;
}

export const CUSTOM_LIMITS_CENTS = { min: 1000, max: 100000 }; // not in the blueprint - a question for Tay

/** Validate a sale and lock the price at the moment of sale. */
export function prepareSale({ option, customCents, buyerName, recipientName, recipientEmail = '', message = '' }) {
  const errors = [];
  if (!buyerName?.trim()) errors.push('Who is it from?');
  if (!recipientName?.trim()) errors.push('Who is it for?');
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) errors.push('That email address is not valid.');
  let amountCents = option?.amountCents ?? null;
  if (option?.kind === 'custom') {
    if (!Number.isInteger(customCents)) errors.push('Enter a custom amount.');
    else if (customCents < CUSTOM_LIMITS_CENTS.min || customCents > CUSTOM_LIMITS_CENTS.max)
      errors.push(`Custom amounts run from $${CUSTOM_LIMITS_CENTS.min / 100} to $${CUSTOM_LIMITS_CENTS.max / 100}.`);
    amountCents = customCents;
  }
  if (!option) errors.push('Pick a gift.');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    card: {
      kind: option.kind === 'custom' ? 'amount' : option.kind,
      amountCents,
      buyerName: buyerName.trim(),
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim(),
      message: message.trim(),
    },
  };
}

/**
 * Redeem against the list of sold cards. Pure: returns the new card instead of
 * changing anything, so the same rules run in the app, the function and the demo.
 */
export function redeem(cards, input, nowIso, prefix = 'FL') {
  const code = normalizeCode(input, prefix);
  if (!code) return { ok: false, reason: 'bad-format', message: 'That is not a gift card code. Codes look like FL-7K2Q9P.' };
  const card = cards.find((c) => c.code === code);
  if (!card) return { ok: false, code, reason: 'unknown', message: 'That code is not one of ours.' };
  if (card.status === 'redeemed')
    return { ok: false, code, reason: 'already-redeemed', card, message: `Already redeemed on ${card.redeemedAt.slice(0, 10)}.` };
  if (card.status !== 'active') return { ok: false, code, reason: `status-${card.status}`, card, message: 'That card is not active yet.' };
  return { ok: true, code, card: { ...card, status: 'redeemed', redeemedAt: nowIso } };
}

/** What a client sees from "Check a card": value and status only, never names or the message. */
export function publicCardView(card) {
  if (!card) return { found: false };
  return { found: true, title: cardTitle(card), status: card.status === 'redeemed' ? 'Redeemed' : card.status === 'active' ? 'Active' : 'Not active yet' };
}

export function cardTitle(card) {
  if (card.kind === 'standard') return `One Standard Clean ($${(card.amountCents / 100).toFixed(2).replace(/\.00$/, '')})`;
  if (card.kind === 'deep') return `One Deep Clean ($${(card.amountCents / 100).toFixed(2).replace(/\.00$/, '')})`;
  return `$${(card.amountCents / 100).toFixed(2).replace(/\.00$/, '')} Gift Card`;
}

/** The summary bar: cards sold, value sold, still to redeem, redeemed. */
export function giftSummary(cards) {
  const sold = cards.filter((c) => c.status === 'active' || c.status === 'redeemed');
  const sum = (xs) => xs.reduce((a, c) => a + c.amountCents, 0);
  return {
    cardsSold: sold.length,
    valueSoldCents: sum(sold),
    stillToRedeemCents: sum(sold.filter((c) => c.status === 'active')),
    redeemedCents: sum(sold.filter((c) => c.status === 'redeemed')),
  };
}

/** Blueprint sample cards (page 14). */
export const SAMPLE_CARDS = Object.freeze([
  { code: 'FL-7K2Q9P', kind: 'amount', amountCents: 10000, buyerName: 'Amy M.', recipientName: 'Diane', status: 'active', soldAt: '2026-10-02T15:00:00Z', redeemedAt: null, buyerClientId: 'amy' },
  { code: 'FL-3M8XTD', kind: 'standard', amountCents: 16500, buyerName: 'Jean A.', recipientName: 'the Nelsons', status: 'redeemed', soldAt: '2026-09-12T15:00:00Z', redeemedAt: '2026-10-20T16:30:00Z', buyerClientId: 'jean' },
]);
