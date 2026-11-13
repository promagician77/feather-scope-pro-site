// Paid hours - the one shared Custom Function (blueprint Dashboard + Cleaner View, pages 16-18).
//
// "Lunch is at 12:00 PM and is at least 30 minutes. Paid hours = Arrived to
// Left, minus lunch minutes, plus any paid commute the owner adds."
// jobs.lunchMinutes: "Default 30 if lunch falls in the job window".
// Test: Arrived 9:00, Left 1:30 with lunch = 4.0 paid hours.

import { localParts, zonedToUtc, parseHHMM } from './time.mjs';

export function paidTime({ arrivedUtc, leftUtc, tz, lunchTime = '12:00', lunchMinutes = 30, paidCommuteMinutes = 0, rateCents = null }) {
  if (!(Number.isFinite(arrivedUtc) && Number.isFinite(leftUtc))) throw new Error('Arrived and Left are both needed');
  const flags = [];
  if (leftUtc < arrivedUtc) throw new Error('Left is before Arrived');
  const workedMin = Math.round((leftUtc - arrivedUtc) / 60000);

  const day = localParts(arrivedUtc, tz);
  const leftDay = localParts(leftUtc, tz);
  if (day.y !== leftDay.y || day.m !== leftDay.m || day.d !== leftDay.d) flags.push('Shift crosses midnight: lunch is checked on the Arrived day only.');

  const { h, mi } = parseHHMM(lunchTime);
  const lunchUtc = zonedToUtc({ ...day, h, mi }, tz);
  const lunchInWindow = lunchUtc >= arrivedUtc && lunchUtc < leftUtc;
  let lunchMin = 0;
  if (lunchInWindow) {
    lunchMin = Math.min(lunchMinutes, workedMin);
    if (workedMin - (lunchUtc - arrivedUtc) / 60000 < lunchMinutes) flags.push('Left less than 30 minutes after 12:00: a full lunch is still deducted.');
  } else if (arrivedUtc > lunchUtc && arrivedUtc - lunchUtc < lunchMinutes * 60000) {
    flags.push('Arrived during the lunch half-hour: no lunch is deducted.');
  }
  const paidMin = workedMin - lunchMin + paidCommuteMinutes;
  return {
    workedMin,
    lunchMin,
    commuteMin: paidCommuteMinutes,
    paidMin,
    hours: paidMin / 60,
    payCents: rateCents == null ? null : Math.round((paidMin * rateCents) / 60),
    flags,
  };
}
