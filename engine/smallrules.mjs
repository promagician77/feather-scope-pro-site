// Referral codes, product allergy flags, the Scope-clear badge, and money totals.

// ---------- Referrals (Screen 7, page 26) ----------
// "FEATHER- plus their first name. If two clients share a first name, add a
// number (FEATHER-AMY2)." The prefix is a business setting here, not a
// constant: a second business's clients should not get FEATHER- codes.

export function referralCode(firstName, existingCodes = [], prefix = 'FEATHER') {
  const clean = String(firstName ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '') || 'CLIENT';
  const taken = new Set(existingCodes.map((c) => normalizeReferral(c)));
  let code = `${prefix}-${clean}`;
  for (let n = 2; taken.has(code); n++) code = `${prefix}-${clean}${n}`;
  return code;
}

/** "always stored in capitals, spaces removed" */
export function normalizeReferral(input) {
  return String(input ?? '').toUpperCase().replace(/\s+/g, '');
}

/**
 * Credits become real when the new client's first clean is paid; each credit
 * applies once. Returns the referral after the step, plus what changed.
 */
export function releaseReferralCredits(referral, { firstCleanPaid }) {
  if (!firstCleanPaid || referral.creditsReleased) return { referral, released: [] };
  const amt = referral.creditAmountCents ?? 2500;
  return {
    referral: { ...referral, creditsReleased: true },
    released: [
      { clientId: referral.referrerClientId, cents: amt, creditUsed: false, id: `${referral.id}_referrer` },
      { clientId: referral.newClientId, cents: amt, creditUsed: false, id: `${referral.id}_new` },
    ],
  };
}

export function applyCredit(credit, invoice) {
  if (credit.creditUsed) return { ok: false, reason: 'Credit already used', credit, invoice };
  if (invoice.status !== 'unpaid') return { ok: false, reason: 'Invoice is not unpaid', credit, invoice };
  const off = Math.min(credit.cents, invoice.amountCents);
  return {
    ok: true,
    credit: { ...credit, creditUsed: true, appliedToInvoiceId: invoice.id },
    invoice: { ...invoice, amountCents: invoice.amountCents - off, creditsApplied: [...(invoice.creditsApplied || []), credit.id] },
  };
}

// ---------- Products (Screen 10, page 31) ----------
export const CONTAINS = ['Bleach', 'Fragrance', 'Ammonia', 'None'];

/** One shared function for Checklist, Dashboard, Cleaner View and Client View. */
export function productBlockedForClient(product, client) {
  if (!product || product.contains === 'None' || !product.contains) return false;
  const allergies = (client?.allergies || []).map((a) => String(a).toLowerCase());
  return allergies.includes(String(product.contains).toLowerCase());
}

// ---------- Scope-clear badge (Screen 8, page 28) ----------
export const BADGE_TEXT = "Scope-clear cleaning - see exactly what's included";

export function newScopeToken(randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = randomBytes(32);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** badgeSnippet(client): the link snippet for the owner's website. */
export function badgeSnippet({ scopePageBaseUrl, scopePageToken }) {
  let url;
  try { url = new URL(scopePageBaseUrl); } catch { throw new Error('scopePageBaseUrl is not a web address'); }
  if (url.protocol !== 'https:') throw new Error('scopePageBaseUrl must start with https://');
  if (!/^[A-Za-z0-9_-]{32,}$/.test(scopePageToken || '')) throw new Error('scopePageToken must be a long random token');
  const href = url.href.replace(/\/?$/, '/') + encodeURIComponent(scopePageToken);
  return `<a href="${escAttr(href)}">${escText(BADGE_TEXT)}</a>`;
}

// ---------- Money (Screen 11, page 32) ----------
/** income - spending - wages = profit, in whole cents. */
export function moneySummary(entries) {
  const sum = (kind) => entries.filter((e) => e.kind === kind).reduce((a, e) => a + e.amountCents, 0);
  const income = sum('income'), spending = sum('spending'), wages = sum('wages');
  return { incomeCents: income, spendingCents: spending, wagesCents: wages, profitCents: income - spending - wages };
}

/**
 * Income that can be counted twice under the blueprint's sources
 * (manual / invoice / scopeUpsell / giftCard): a gift card sold (income) and
 * later redeemed against a paid clean (income again), or an approved upsell
 * row plus the invoice that already includes the upsell.
 */
export function doubleCountedIncome(entries) {
  const out = [];
  const byJob = new Map();
  for (const e of entries.filter((x) => x.kind === 'income')) {
    if (e.jobId) byJob.set(e.jobId, [...(byJob.get(e.jobId) || []), e]);
  }
  for (const [jobId, rows] of byJob) {
    const invoices = rows.filter((r) => r.source === 'invoice');
    for (const up of rows.filter((r) => r.source === 'scopeUpsell')) {
      if (invoices.some((inv) => inv.includesUpsells?.includes(up.upsellId))) out.push({ jobId, cents: up.amountCents, why: 'Upsell row and the invoice that already includes it' });
    }
  }
  const giftSales = new Map(entries.filter((e) => e.kind === 'income' && e.source === 'giftCard').map((e) => [e.giftCode, e]));
  for (const e of entries.filter((x) => x.kind === 'income' && x.paidWithGiftCode)) {
    const sale = giftSales.get(e.paidWithGiftCode);
    if (sale) out.push({ jobId: e.jobId, cents: Math.min(sale.amountCents, e.amountCents), why: `Gift card ${e.paidWithGiftCode} counted at sale and again at redemption` });
  }
  return out;
}
