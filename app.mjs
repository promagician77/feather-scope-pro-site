import { zonedToUtc, localParts, formatClock, formatLocal } from './engine/time.mjs';
import { reminderTiming, reminderText, dayBeforeTargets, naiveTomorrowWindow } from './engine/reminders.mjs';
import { DEFAULT_POLICY_TEXT, policyTextDrift } from './engine/cancellation.mjs';
import { smsSegments, nonGsmChars, toGsmSafe } from './engine/sms.mjs';
import {
  SAMPLE_CARDS, FEATHER_GIFT_SWITCHES, GIFT_AMOUNTS_CENTS, giftOptions, prepareSale, generateCode,
  redeem, giftSummary, cardTitle,
} from './engine/giftcards.mjs';
import { FEATHER_PRICING, SERVICE_TYPES, quoteTotal, usd } from './engine/quote.mjs';
import { paidTime } from './engine/hours.mjs';
import { FINDINGS, GROUPS } from './data/findings.mjs';

const TZ = 'America/Chicago';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => usd(c).replace('.00', '');

// ------------------------------------------------------------ hero timeline
const DAY = { y: 2026, m: 11, d: 17 }; // a Tuesday
const span0 = zonedToUtc({ y: 2026, m: 11, d: 15, h: 12, mi: 0 }, TZ);
const span1 = zonedToUtc({ y: 2026, m: 11, d: 17, h: 21, mi: 0 }, TZ);
const pct = (ms) => ((ms - span0) / (span1 - span0)) * 100;

function drawTicks() {
  const ticks = $('ticks');
  let html = '';
  for (let t = span0; t <= span1; t += 3600e3) {
    const p = localParts(t, TZ);
    if (p.h === 0) html += `<div class="tick day" style="left:${pct(t)}%"><span>${p.weekday}</span></div>`;
    else if (p.h === 6 || p.h === 18) html += `<div class="tick" style="left:${pct(t)}%"><span>${p.h === 6 ? '6 AM' : '6 PM'}</span></div>`;
  }
  ticks.innerHTML = html;
}

function drawStrip() {
  const minutes = +$('clean-time').value;
  const startUtc = zonedToUtc({ ...DAY, h: Math.floor(minutes / 60), mi: minutes % 60 }, TZ);
  const two = $('two-evenings').checked;
  const t = reminderTiming({ startUtc, tz: TZ, daysBefore: two ? 2 : 1 });
  $('clean-time-label').textContent = formatClock(startUtc, TZ);
  const cut = pct(t.freeUntilUtc), start = pct(startUtc), pin = pct(t.sendUtc);
  Object.assign($('band-free').style, { left: '0%', width: `${cut}%` });
  Object.assign($('band-fee').style, { left: `${cut}%`, width: `${start - cut}%` });
  Object.assign($('clean-block').style, { left: `${start}%`, width: `${pct(startUtc + 3 * 3600e3) - start}%` });
  $('cut').style.left = `${cut}%`;
  $('pin').style.left = `${pin}%`;
  $('pin').classList.toggle('is-open', !t.insideWindow);
  const when = formatLocal(t.sendUtc, TZ).replace(', ', ' at ').replace(/^(\w+) \w+ \d+ at/, '$1 at');
  const free = formatLocal(t.freeUntilUtc, TZ).replace(/^(\w+) \w+ \d+, /, '$1 ');
  const r = $('strip-readout');
  r.classList.toggle('is-open', !t.insideWindow);
  if (t.insideWindow) {
    const closed = t.closedHoursBeforeReminder;
    r.innerHTML = `The reminder goes out ${esc(when)}, ${fmtHours(t.noticeHours)} before the clean. Free cancellation closed ${esc(free)}: <strong>${fmtHours(closed)} before the text arrived</strong>, so the client reads "let us know as soon as you can" when cancelling already costs 25%.`;
  } else {
    const left = (t.noticeHours - 24);
    r.innerHTML = left < 0.01
      ? `The reminder goes out ${esc(when)}, exactly 24 hours before the clean. <strong>Free cancellation ends the moment it arrives.</strong>`
      : `The reminder goes out ${esc(when)}, ${fmtHours(t.noticeHours)} before the clean. <strong>The client still has ${fmtHours(left)} to cancel free</strong> (until ${esc(free)}).`;
  }
}
function fmtHours(h) {
  if (h < 1) return `${Math.round(h * 60)} minutes`;
  const whole = Math.floor(h + 1e-9), half = h - whole >= 0.5 - 1e-9;
  return `${whole}${half ? '½' : ''} hour${whole === 1 && !half ? '' : 's'}`;
}

// ------------------------------------------------------------ what I ran
async function loadResults() {
  try {
    const res = await fetch('data/results.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const r = await res.json();
    const items = [
      [`${r.engineTests.pass}/${r.engineTests.tests}`, 'rule tests pass: hours, quotes, cancellation, texts, gift cards, referrals'],
      [`${r.functionTests.pass}/${r.functionTests.tests}`, 'Cloud Function tests pass against a Firestore emulator'],
      [`${r.mutation.caught}/${r.mutation.total}`, 'planted bugs caught by those tests'],
      [r.measure.yearScan[0].naiveMissed, 'evenings in 2026 a UTC "tomorrow" reminds the wrong day'],
    ];
    $('ran-list').innerHTML = items.map(([b, s]) => `<li><b>${esc(b)}</b><span>${esc(s)}</span></li>`).join('');
    const g = r.measure.giftCodes, s = r.measure.sms;
    $('measured').innerHTML = [
      `${r.engineTests.pass} of ${r.engineTests.tests} engine tests and ${r.functionTests.pass} of ${r.functionTests.tests} function tests pass (Node ${esc(r.node)}, ${esc(r.date)}).`,
      `${r.mutation.caught} of ${r.mutation.total} deliberately planted bugs are caught - including an upsell sync without a transaction, a redeem without one, and a reminder window taken from the UTC clock.`,
      `Reminder for a 9 AM clean: ${r.measure.reminderWindow.find((x) => x.cleanAt === '09:00').noticeHoursAtReminder} hours' notice; every clean before 6 PM is inside the 24-hour window.`,
      `UTC "tomorrow": wrong on ${r.measure.yearScan[0].naiveMissed} of 365 evenings in 2026 and ${r.measure.yearScan[1].naiveMissed} in 2027.`,
      `Reminder text: ${s.plain.segments} segments as written, ${s.curlyApostrophe.segments} with one curly apostrophe.`,
      `${g.drawn.toLocaleString('en-US')} gift codes drawn: ${g.repeatsSeen} repeats against ${g.repeatsExpected} expected; at 10,000 cards the chance of at least one repeat is ${(g.pAnyCollisionAt10000Cards * 100).toFixed(1)}%.`,
    ].map((x) => `<li>${x}</li>`).join('');
  } catch {
    $('ran-list').innerHTML = '<li><b>Results</b><span>Run tools/run-all.mjs to fill this in.</span></li>';
  }
}

// ------------------------------------------------------------ tabs
function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length], true);
      if (e.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length], true);
      if (e.key === 'Home') select(tabs[0], true);
      if (e.key === 'End') select(tabs[tabs.length - 1], true);
    });
  });
}

// ------------------------------------------------------------ gift cards
const gift = {
  switches: structuredClone(FEATHER_GIFT_SWITCHES),
  pricing: structuredClone(FEATHER_PRICING),
  cards: SAMPLE_CARDS.map((c) => ({ ...c })),
  pendingCode: generateCode(),
};

function renderSwitches() {
  const s = gift.switches;
  const box = (id, label, on) => `<label><input type="checkbox" data-sw="${id}" ${on ? 'checked' : ''}> ${label}</label>`;
  $('gift-switches').innerHTML = [
    ...GIFT_AMOUNTS_CENTS.map((c) => box(`amt-${c}`, `$${c / 100}`, s.giftAmountsOn.includes(c))),
    box('custom', 'Custom amount', s.giftCustomEnabled),
    box('standard', `One Standard Clean`, s.giftStandardCleanEnabled),
    box('deep', `One Deep Clean`, s.giftDeepCleanEnabled),
  ].join('');
}

function renderSellOptions() {
  const sel = $('sell-option');
  const prev = sel.value;
  const opts = giftOptions(gift.switches, gift.pricing);
  sel.innerHTML = opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
  const keep = opts.findIndex((o) => o.label === prev || `${o.kind}:${o.amountCents}` === prev);
  sel.value = String(keep >= 0 ? keep : Math.min(3, opts.length - 1));
  sel.dataset.opts = JSON.stringify(opts);
  updatePreview();
}
const currentOption = () => {
  const opts = JSON.parse($('sell-option').dataset.opts || '[]');
  return opts[+$('sell-option').value];
};
const customCents = () => {
  const v = $('sell-custom').value.trim();
  if (!v) return null;
  const n = Number(v.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

function updatePreview() {
  const o = currentOption();
  $('custom-wrap').hidden = o?.kind !== 'custom';
  let value = '';
  if (!o) value = 'No gifts switched on';
  else if (o.kind === 'custom') value = Number.isInteger(customCents()) ? money(customCents()) : 'Custom amount';
  else if (o.kind === 'amount') value = money(o.amountCents);
  else value = o.kind === 'standard' ? 'One Standard Clean' : 'One Deep Clean';
  const sub = o && (o.kind === 'standard' || o.kind === 'deep') ? `A ${money(o.amountCents)} clean, paid in full` : 'Spend on any clean';
  const msg = $('sell-msg').value.trim();
  $('gift-preview').innerHTML = `
    <div class="gc-value">${esc(value)}</div>
    <div class="gc-sub">${esc(sub)}</div>
    <p class="gc-msg">${msg ? `"${esc(msg)}"` : ''}</p>
    <div class="gc-sub">To ${esc($('sell-to').value || '...')} &middot; from ${esc($('sell-from').value || '...')}</div>
    <div class="gc-code">FL-&bull;&bull;&bull;&bull;&bull;&bull;</div>
    <div class="gc-brand">Feather Lady Cleaning</div>`;
}

function renderGiftList() {
  const s = giftSummary(gift.cards);
  $('gift-summary').innerHTML = [
    ['Cards sold', s.cardsSold], ['Value sold', money(s.valueSoldCents)],
    ['Still to redeem', money(s.stillToRedeemCents)], ['Redeemed', money(s.redeemedCents)],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('sold-list').innerHTML = [...gift.cards].reverse().map((c) => `
    <li><span class="code">${esc(c.code)}</span><span class="status status-${c.status}">${c.status === 'redeemed' ? `Redeemed ${esc(c.redeemedAt.slice(5, 10).replace('-', '/'))}` : 'Active'}</span>
    <span class="who">${esc(cardTitle(c))} - from ${esc(c.buyerName)} to ${esc(c.recipientName)}</span></li>`).join('');
}

function sellCard(state, option, extra) {
  const sale = prepareSale({ option, ...extra });
  if (!sale.ok) return sale;
  let code;
  do code = generateCode(); while (state.cards.some((c) => c.code === code));
  const card = { ...sale.card, code, status: 'active', soldAt: new Date().toISOString(), redeemedAt: null };
  state.cards.push(card);
  return { ok: true, card };
}

function setupGift() {
  renderSwitches();
  renderSellOptions();
  renderGiftList();
  $('gift-switches').addEventListener('change', (e) => {
    const id = e.target.dataset.sw;
    const s = gift.switches;
    if (id.startsWith('amt-')) {
      const c = +id.slice(4);
      s.giftAmountsOn = e.target.checked ? [...new Set([...s.giftAmountsOn, c])].sort((a, b) => a - b) : s.giftAmountsOn.filter((x) => x !== c);
    } else if (id === 'custom') s.giftCustomEnabled = e.target.checked;
    else if (id === 'standard') s.giftStandardCleanEnabled = e.target.checked;
    else if (id === 'deep') s.giftDeepCleanEnabled = e.target.checked;
    renderSellOptions();
  });
  for (const id of ['sell-option', 'sell-custom', 'sell-from', 'sell-to', 'sell-msg']) $(id).addEventListener('input', updatePreview);
  $('sell-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const o = currentOption();
    const r = sellCard(gift, o, { customCents: customCents(), buyerName: $('sell-from').value, recipientName: $('sell-to').value, message: $('sell-msg').value });
    $('sell-error').textContent = r.ok ? '' : r.errors.join(' ');
    if (r.ok) {
      renderGiftList();
      const res = $('redeem-result');
      res.className = 'result ok';
      res.textContent = `Created ${r.card.code}: ${cardTitle(r.card)}.`;
    }
  });
  $('redeem-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = redeem(gift.cards, $('redeem-code').value, new Date().toISOString());
    const res = $('redeem-result');
    if (r.ok) {
      gift.cards = gift.cards.map((c) => (c.code === r.code ? r.card : c));
      res.className = 'result ok';
      res.textContent = `Redeemed ${r.code}: ${cardTitle(r.card)}.`;
      renderGiftList();
    } else {
      res.className = 'result no';
      res.textContent = r.code ? `${r.code}: ${r.message}` : r.message;
    }
  });
  $('run-gift-plan').addEventListener('click', runGiftPlan);
}

function runGiftPlan() {
  const st = { switches: structuredClone(FEATHER_GIFT_SWITCHES), pricing: structuredClone(FEATHER_PRICING), cards: SAMPLE_CARDS.map((c) => ({ ...c })) };
  const checks = [];
  const check = (label, ok) => checks.push({ label, ok: !!ok });
  const labels = () => giftOptions(st.switches, st.pricing).map((o) => o.label);

  check('$200 is OFF by default and absent from the sell form', !labels().includes('Gift card - $200'));
  st.switches.giftDeepCleanEnabled = false;
  check('One Deep Clean switched OFF leaves the form', !labels().some((l) => l.startsWith('One Deep Clean')));
  st.switches.giftDeepCleanEnabled = true;
  check('...and returns when switched back ON', labels().some((l) => l.startsWith('One Deep Clean')));

  const opts = giftOptions(st.switches, st.pricing);
  const fifty = sellCard(st, opts.find((o) => o.amountCents === 5000), { buyerName: 'Mai L.', recipientName: 'Nia R.' }).card;
  const custom = sellCard(st, opts.find((o) => o.kind === 'custom'), { customCents: 4200, buyerName: 'Sarah P.', recipientName: 'Lee P.' }).card;
  const deep = sellCard(st, opts.find((o) => o.kind === 'deep'), { buyerName: 'Amy M.', recipientName: 'Diane' }).card;
  check('Sold a $50 card, a $42 custom card and a One Deep Clean card', fifty && custom?.amountCents === 4200 && deep);
  check('The cleaning gift is priced from My Pricing ($264)', deep.amountCents === 26400);
  st.pricing.base.Deep = 29000;
  check('Deep raised to $290: new gifts follow, the sold card keeps $264',
    giftOptions(st.switches, st.pricing).find((o) => o.kind === 'deep').amountCents === 29000 && deep.amountCents === 26400);

  const r1 = redeem(st.cards, fifty.code, '2026-11-13T15:00:00Z');
  if (r1.ok) st.cards = st.cards.map((c) => (c.code === r1.code ? r1.card : c));
  check(`Redeem ${fifty.code} once: success`, r1.ok);
  const r2 = redeem(st.cards, fifty.code, '2026-11-13T16:00:00Z');
  check('Same code again: refused, with its redeemed date', !r2.ok && r2.reason === 'already-redeemed' && /2026-11-13/.test(r2.message));
  let madeUp; do madeUp = generateCode(); while (st.cards.some((c) => c.code === madeUp));
  check(`A made-up code in the right format (${madeUp}): refused`, redeem(st.cards, madeUp, 'x').reason === 'unknown');
  const sloppy = ' ' + custom.code.toLowerCase().replace('-', ' ').replace(/(...)$/, ' $1') + ' ';
  const r3 = redeem(st.cards, sloppy, '2026-11-13T17:00:00Z');
  if (r3.ok) st.cards = st.cards.map((c) => (c.code === r3.code ? r3.card : c));
  check(`Typed "${sloppy.trim()}" (lower case, spaces): redeems the second card`, r3.ok && r3.code === custom.code);

  const s = giftSummary(st.cards);
  const byHand = st.cards.reduce((a, c) => ({ n: a.n + 1, v: a.v + c.amountCents, act: a.act + (c.status === 'active' ? c.amountCents : 0), red: a.red + (c.status === 'redeemed' ? c.amountCents : 0) }), { n: 0, v: 0, act: 0, red: 0 });
  check(`Summary matches the list by hand: ${s.cardsSold} cards, ${money(s.valueSoldCents)} sold, ${money(s.stillToRedeemCents)} to redeem, ${money(s.redeemedCents)} redeemed`,
    s.cardsSold === byHand.n && s.valueSoldCents === byHand.v && s.stillToRedeemCents === byHand.act && s.redeemedCents === byHand.red);

  $('gift-checks').innerHTML = checks.map((c) => `<li class="${c.ok ? 'pass' : 'fail'}">${esc(c.label)}</li>`).join('');
  gift.cards = st.cards;
  renderGiftList();
  const res = $('redeem-result');
  const passed = checks.filter((c) => c.ok).length;
  res.className = passed === checks.length ? 'result ok' : 'result no';
  res.textContent = `${passed} of ${checks.length} checks pass. The sold list now shows the cards from the run.`;
}

// ------------------------------------------------------------ texts
const reminderStart = zonedToUtc({ ...DAY, h: 9, mi: 0 }, TZ);
const baseReminder = reminderText({ businessName: 'Feather Lady Cleaning LLC', clientFirstName: 'Stephanie', startUtc: reminderStart, tz: TZ });

function renderSms() {
  const text = $('sms-text').value;
  const s = smsSegments(text);
  const bad = nonGsmChars(text);
  $('sms-meter').innerHTML = `
    <div class="${s.encoding === 'UCS-2' ? 'warn' : ''}"><dt>Encoding</dt><dd>${s.encoding}</dd></div>
    <div><dt>Characters</dt><dd>${[...text].length}</dd></div>
    <div class="${s.segments > 2 ? 'warn' : ''}"><dt>Segments billed</dt><dd>${s.segments}</dd></div>`;
  const f = $('sms-flags');
  if (bad.length) {
    const uniq = [...new Map(bad.map((b) => [b.ch, b])).values()];
    f.className = 'sms-flags';
    f.textContent = `${uniq.map((b) => `"${b.ch}" (${b.code})`).join(', ')} switch${uniq.length === 1 ? 'es' : ''} the whole text to UCS-2: ${s.perSegment} characters a segment instead of ${s.perSegment === 67 ? 153 : 160}.`;
  } else {
    f.className = 'sms-flags ok';
    f.textContent = 'Plain GSM-7: 160 characters fit one segment, 153 per segment when longer.';
  }
}

const JEAN = [
  { id: 'amy', name: 'Amy M.', dayOffset: 1, h: 9, phone: '+1608...', remindersOff: false },
  { id: 'jean', name: 'Jean A.', dayOffset: 1, h: 10, phone: '+1608...', remindersOff: true },
  { id: 'steph', name: 'Stephanie K.', dayOffset: 2, h: 9, phone: '+1608...', remindersOff: false },
];
function jeanDay() {
  const [y, m, d] = $('jean-date').value.split('-').map(Number);
  return { y, m, d };
}
function jeanJobs() {
  const base = jeanDay();
  return JEAN.map((c) => {
    const t = new Date(Date.UTC(base.y, base.m - 1, base.d + c.dayOffset));
    return { id: `j-${c.id}`, clientId: c.id, status: 'scheduled', startUtc: zonedToUtc({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: c.h, mi: 0 }, TZ) };
  });
}
function renderJean(texted = null, wrong = new Set()) {
  const jobs = jeanJobs();
  $('jean-rows').innerHTML = JEAN.map((c, i) => `
    <tr class="${texted?.has(c.id) ? (wrong.has(c.id) ? 'wrong' : 'texted') : ''}">
      <td>${esc(c.name)}</td>
      <td>${esc(formatLocal(jobs[i].startUtc, TZ))}</td>
      <td><label><input type="checkbox" data-jean="${c.id}" ${c.remindersOff ? '' : 'checked'}> ${c.remindersOff ? 'Off' : 'On'}</label></td>
    </tr>`).join('');
}
function runJean(mode) {
  const day = jeanDay();
  const runAtUtc = zonedToUtc({ ...day, h: 18, mi: 0 }, TZ);
  const jobs = jeanJobs();
  const clientsById = Object.fromEntries(JEAN.map((c) => [c.id, { phone: c.phone, remindersOff: c.remindersOff }]));
  const tomorrow = new Set(jobs.filter((j) => { const [f, t] = dayBeforeTargets({ runAtUtc, tz: TZ, jobs: [], clientsById }).windowUtc; return j.startUtc >= f && j.startUtc < t; }).map((j) => j.clientId));
  let texted;
  if (mode === 'local') {
    texted = new Set(dayBeforeTargets({ runAtUtc, tz: TZ, jobs, clientsById }).send.map((s) => s.clientId));
  } else {
    const [f, t] = naiveTomorrowWindow(runAtUtc);
    texted = new Set(jobs.filter((j) => j.startUtc >= f && j.startUtc < t && !clientsById[j.clientId].remindersOff).map((j) => j.clientId));
  }
  const wrong = new Set([...texted].filter((id) => !tomorrow.has(id)));
  const shouldHave = JEAN.filter((c) => tomorrow.has(c.id) && !c.remindersOff).map((c) => c.id);
  const missed = shouldHave.filter((id) => !texted.has(id));
  renderJean(texted, wrong);
  const names = (ids) => ids.map((id) => JEAN.find((c) => c.id === id).name).join(' and ') || 'nobody';
  const utcClock = new Date(runAtUtc).toISOString().slice(11, 16);
  const res = $('jean-result');
  const ok = !wrong.size && !missed.length;
  res.className = ok ? 'result ok' : 'result no';
  const jeanNote = JEAN.find((c) => c.id === 'jean').remindersOff ? ' Jean has reminders off and gets nothing.' : '';
  if (mode === 'local') {
    res.textContent = `6:00 PM in Madison: texted ${names([...texted])}.${jeanNote}${ok ? ' Correct.' : ''}`;
  } else if (ok) {
    res.textContent = `6:00 PM in Madison is ${utcClock} UTC. Texted ${names([...texted])}. Correct on this date: in daylight time the UTC date has not rolled over yet.`;
  } else {
    const parts = [];
    if (wrong.size) parts.push(`${names([...wrong])} was texted a day early`);
    if (missed.length) parts.push(`${names(missed)} got nothing`);
    res.textContent = `6:00 PM in Madison is ${utcClock} UTC the next day, so the server's "tomorrow" is the day after. ${parts.join('; ')}.`;
  }
}

function setupTexts() {
  $('sms-text').value = baseReminder;
  renderSms();
  $('sms-text').addEventListener('input', renderSms);
  $('sms-iphone').addEventListener('click', () => {
    $('sms-text').value = $('sms-text').value.replace(/'/g, '’').replace(/ - /g, ' — ');
    renderSms();
  });
  $('sms-clean').addEventListener('click', () => { $('sms-text').value = toGsmSafe($('sms-text').value); renderSms(); });
  renderJean();
  $('jean-rows').addEventListener('change', (e) => {
    const c = JEAN.find((x) => x.id === e.target.dataset.jean);
    if (c) { c.remindersOff = !e.target.checked; renderJean(); $('jean-result').textContent = ''; }
  });
  $('jean-date').addEventListener('change', () => { renderJean(); $('jean-result').textContent = ''; });
  $('jean-local').addEventListener('click', () => runJean('local'));
  $('jean-utc').addEventListener('click', () => runJean('utc'));
}

// ------------------------------------------------------------ hours and quotes
function renderHours() {
  const hm = (id) => $(id).value.split(':').map(Number);
  const [ih, im] = hm('h-in'), [oh, om] = hm('h-out');
  const out = $('hours-result'), flags = $('hours-flags');
  try {
    const r = paidTime({
      arrivedUtc: zonedToUtc({ ...DAY, h: ih, mi: im }, TZ), leftUtc: zonedToUtc({ ...DAY, h: oh, mi: om }, TZ), tz: TZ,
      paidCommuteMinutes: Math.max(0, Math.round(+$('h-commute').value || 0)), rateCents: Math.round((+$('h-rate').value || 0) * 100),
    });
    out.innerHTML = `${(r.paidMin / 60).toFixed(2).replace(/0$/, '')} paid hours<small>${r.workedMin} min on site, minus ${r.lunchMin} min lunch, plus ${r.commuteMin} min commute = ${r.paidMin} min. Wages ${money(r.payCents)}.</small>`;
    flags.className = 'sms-flags';
    flags.textContent = r.flags.join(' ');
  } catch (e) {
    out.textContent = '';
    flags.className = 'sms-flags';
    flags.textContent = e.message + '.';
  }
}

const SAMPLE_ADDON = {
  oven: { 'East Madison': 3500, 'Cottage Grove': 4000, 'Sun Prairie': 4500 },
  stairs: { 'East Madison': 2000, 'Cottage Grove': 2250, 'Sun Prairie': 2750 },
  appliances: { 'East Madison': 3000, 'Cottage Grove': 3250, 'Sun Prairie': 3750 },
};
const quoteState = { pricing: structuredClone(FEATHER_PRICING) };
for (const [k, byArea] of Object.entries(SAMPLE_ADDON)) Object.assign(quoteState.pricing.addons[k].prices, byArea);

function setupQuote() {
  const p = quoteState.pricing;
  $('q-type').innerHTML = SERVICE_TYPES.map((t) => `<option ${t === 'Standard' ? 'selected' : ''}>${t}</option>`).join('');
  $('q-area').innerHTML = p.areas.map((a) => `<option>${a}</option>`).join('');
  $('q-addons').innerHTML = Object.entries(p.addons).map(([k, a]) => `<label><input type="checkbox" data-addon="${k}"> ${esc(a.label)}</label>`).join('');
  $('q-price-grid').innerHTML = `<span></span>${p.areas.map((a) => `<span>${esc(a)}</span>`).join('')}` +
    Object.entries(p.addons).map(([k, a]) => `<span>${esc(a.label)}</span>${p.areas.map((ar) => `<input aria-label="${esc(a.label)} in ${esc(ar)}" data-price="${k}|${ar}" value="${(a.prices[ar] / 100).toFixed(2)}" inputmode="decimal">`).join('')}`).join('');
  $('q-policy').value = DEFAULT_POLICY_TEXT;
  $('quote-form').addEventListener('input', (e) => {
    const key = e.target.dataset.price;
    if (key) {
      const [k, ar] = key.split('|');
      const v = Number(e.target.value.replace(/[$,]/g, ''));
      p.addons[k].prices[ar] = e.target.value.trim() === '' || !Number.isFinite(v) ? null : Math.round(v * 100);
    }
    renderQuote();
  });
  $('q-policy').addEventListener('input', renderQuote);
  renderQuote();
}

function renderQuote() {
  const type = $('q-type').value;
  $('q-hours-wrap').hidden = Number.isInteger(quoteState.pricing.base[type]);
  $('q-turn-wrap').hidden = type !== 'Airbnb';
  const addons = [...document.querySelectorAll('[data-addon]')].filter((x) => x.checked).map((x) => x.dataset.addon);
  const q = quoteTotal(quoteState.pricing, {
    serviceType: type, serviceArea: $('q-area').value, hoursEst: Math.max(0, +$('q-hours').value || 0),
    turnovers: Math.max(1, +$('q-turn').value || 1), addons,
  });
  const policy = $('q-policy').value.trim();
  $('quote-out').innerHTML = `
    <table>${q.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${money(l.cents)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${money(q.totalCents)}</td></tr></table>
    ${q.issues.map((i) => `<p class="issue">${esc(i)}</p>`).join('')}
    <p class="policy-line">${policy ? esc(policy) : '<strong>The policy cannot be empty: type one or reset it.</strong>'}</p>`;
  const drift = policy ? policyTextDrift(policy) : [];
  const el = $('policy-drift');
  el.className = drift.length ? 'sms-flags' : 'sms-flags ok';
  el.textContent = drift.length ? `${drift.join(' ')} The reminder text would still say 24 hours and 25%.` : 'The quote, the reminder line and the fee all say 24 hours and 25%.';
}

// ------------------------------------------------------------ findings
function renderFindings(group = 'all') {
  const list = FINDINGS.filter((f) => group === 'all' || f.group === group);
  $('find-count').textContent = String(FINDINGS.length);
  $('find-list').innerHTML = list.map((f) => `
    <li id="f-${f.id}"><details>
      <summary><span class="f-title">${esc(f.title)}<span class="f-group g-${f.group}">${esc(GROUPS[f.group])}</span></span>
      <span class="f-pages">p. ${f.pages.join(', ')}</span></summary>
      <div class="find-body">
        <div><h4>What happens</h4><p>${esc(f.what)}</p></div>
        <div><h4>What I would do</h4><p>${esc(f.fix)}</p></div>
        ${f.proof ? `<p class="f-proof">${esc(f.proof)}</p>` : ''}
      </div>
    </details></li>`).join('');
}
function setupFindings() {
  renderFindings();
  document.querySelector('.filters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    for (const c of document.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c === b));
    renderFindings(b.dataset.group);
  });
}

// ------------------------------------------------------------ start
drawTicks();
drawStrip();
$('clean-time').addEventListener('input', drawStrip);
$('two-evenings').addEventListener('change', drawStrip);
setupTabs();
setupGift();
setupTexts();
['h-in', 'h-out', 'h-commute', 'h-rate'].forEach((id) => $(id).addEventListener('input', renderHours));
renderHours();
setupQuote();
setupFindings();
loadResults();

