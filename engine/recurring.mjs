// Recurring jobs (blueprint Automatic jobs, page 38): "For weekly / bi-weekly /
// monthly jobs, creates the next job document far enough ahead (suggest 4 weeks)".
//
// Two things the blueprint leaves open, handled here:
//  - The daily run must be safe to repeat: each occurrence gets a deterministic
//    document ID (series + local date), so a retry or a second run creates nothing new.
//  - The clean stays at 9:00 local across daylight-saving changes (its UTC time moves).

import { addDays, zonedToUtc, ymd, localParts } from './time.mjs';

function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Local dates of a series, from its first clean, up to `until` (a local date). */
function* seriesDates(first, rule) {
  if (rule === 'weekly' || rule === 'bi-weekly') {
    const step = rule === 'weekly' ? 7 : 14;
    for (let i = 0; ; i++) yield addDays(first, i * step);
  } else if (rule === 'monthly') {
    for (let i = 0; ; i++) {
      const mIdx = first.m - 1 + i;
      const y = first.y + Math.floor(mIdx / 12), m = (mIdx % 12) + 1;
      // A series that starts on the 31st cleans on the last day of shorter months.
      yield { y, m, d: Math.min(first.d, daysInMonth(y, m)), clamped: first.d > daysInMonth(y, m) };
    }
  } else throw new Error(`Unknown recurringRule: ${rule}`);
}

export function upcomingOccurrences({ seriesId, first, time, rule, tz, nowUtc, horizonDays = 28 }) {
  const today = localParts(nowUtc, tz);
  const endUtc = zonedToUtc({ ...addDays(today, horizonDays + 1), h: 0, mi: 0 }, tz);
  const out = [];
  for (const date of seriesDates(first, rule)) {
    const startUtc = zonedToUtc({ ...date, ...time }, tz);
    if (startUtc >= endUtc) break;
    if (startUtc <= nowUtc) continue;
    out.push({ id: `${seriesId}_${ymd(date)}`, startUtc, localDate: ymd(date), clamped: !!date.clamped });
    if (out.length > 400) break;
  }
  return out;
}
