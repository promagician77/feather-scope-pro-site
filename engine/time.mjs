// Time-zone helpers with no dependencies (Intl only), shared by the
// Cloud Functions, the tests and the demo page.
//
// The blueprint says "All times are the business's local time (Madison =
// Central)" but the businesses collection has no time-zone field. Every
// function below takes the zone explicitly so a second business in another
// zone works the same way.

const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone. */
export function localParts(utcMs, tz) {
  const p = {};
  for (const part of fmt(tz).formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return {
    y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second,
    weekday: p.weekday,
  };
}

/** Minutes the zone is ahead of UTC at an instant (Chicago: -360 or -300). */
export function offsetMinutes(utcMs, tz) {
  const p = localParts(utcMs, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Local wall time -> UTC ms. A time that occurs twice (fall back) gives the earlier one. */
export function zonedToUtc({ y, m, d, h = 0, mi = 0 }, tz) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const candidates = new Set();
  for (const probe of [wall - 36e5 * 14, wall, wall + 36e5 * 14]) {
    candidates.add(wall - offsetMinutes(probe, tz) * 60000);
  }
  const exact = [...candidates]
    .filter((u) => {
      const p = localParts(u, tz);
      return p.y === y && p.m === m && p.d === d && p.h === h && p.mi === mi;
    })
    .sort((a, b) => a - b);
  if (exact.length) return exact[0];
  // Wall time skipped by a spring-forward gap: read it with the offset in force
  // before the gap, which lands the same distance past the change (2:30 -> 3:30).
  return wall - offsetMinutes(wall - 36e5 * 14, tz) * 60000;
}

export function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** [start, end) in UTC ms of one local calendar day. */
export function localDayWindow(date, tz) {
  return [zonedToUtc({ ...date, h: 0, mi: 0 }, tz), zonedToUtc({ ...addDays(date, 1), h: 0, mi: 0 }, tz)];
}

export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`Not a 24-hour time: ${s}`);
  return { h: +m[1], mi: +m[2] };
}

export function ymd({ y, m, d }) {
  return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

export function formatLocal(utcMs, tz) {
  const p = localParts(utcMs, tz);
  const h12 = ((p.h + 11) % 12) + 1;
  const ampm = p.h < 12 ? 'AM' : 'PM';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${p.weekday} ${months[p.m - 1]} ${p.d}, ${h12}:${String(p.mi).padStart(2, '0')} ${ampm}`;
}

export function formatClock(utcMs, tz) {
  const p = localParts(utcMs, tz);
  const h12 = ((p.h + 11) % 12) + 1;
  return `${h12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}
