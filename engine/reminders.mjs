// Day-before reminder selection (blueprint Screen 5 and Automatic jobs, pages 24 and 38).
//
// "Day-before reminder - Daily at 6:00 PM - Finds tomorrow's jobs; for each
// client with remindersOff = false, sends the Twilio reminder; sets
// reminderSent. Jean (remindersOff) gets nothing."

import { localParts, addDays, localDayWindow, zonedToUtc, parseHHMM, formatLocal, formatClock } from './time.mjs';
import { DEFAULT_POLICY, reminderPolicyLine } from './cancellation.mjs';

/**
 * Which jobs get tomorrow's reminder, with the reason each other job is skipped.
 * "Tomorrow" is the business's local tomorrow, not UTC's.
 */
export function dayBeforeTargets({ runAtUtc, tz, jobs, clientsById, business = {} }) {
  const today = localParts(runAtUtc, tz);
  const [from, to] = localDayWindow(addDays(today, 1), tz);
  const send = [];
  const skip = [];
  for (const job of jobs) {
    const start = job.startUtc;
    if (start < from || start >= to) continue;
    const client = clientsById[job.clientId] || {};
    let reason = null;
    if (business.remindersEnabled === false) reason = 'business reminders off';
    else if (job.status && job.status !== 'scheduled') reason = `job is ${job.status}`;
    else if (job.reminderSent) reason = 'already sent';
    else if (client.remindersOff) reason = 'client has reminders off';
    else if (!client.phone) reason = 'no phone on file';
    (reason ? skip : send).push({ jobId: job.id, clientId: job.clientId, reason });
  }
  return { windowUtc: [from, to], send, skip };
}

/**
 * The version that is easy to write by accident in a Cloud Function: "tomorrow"
 * taken from the server clock, which runs in UTC.
 */
export function naiveTomorrowWindow(runAtUtc) {
  const t = new Date(runAtUtc);
  const from = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
  return [from, from + 864e5];
}

/** When the reminder for a clean goes out, and how much notice is left at that moment. */
export function reminderTiming({ startUtc, tz, reminderTime = '18:00', policy = DEFAULT_POLICY, daysBefore = 1 }) {
  const startDay = localParts(startUtc, tz);
  const { h, mi } = parseHHMM(reminderTime);
  const sendUtc = zonedToUtc({ ...addDays(startDay, -daysBefore), h, mi }, tz);
  const noticeHours = (startUtc - sendUtc) / 3600e3;
  const freeUntilUtc = startUtc - policy.windowHours * 3600e3;
  return {
    sendUtc,
    noticeHours,
    insideWindow: noticeHours < policy.windowHours,
    freeUntilUtc,
    // How long before the reminder the free-cancellation deadline already passed.
    closedHoursBeforeReminder: Math.max(0, (sendUtc - freeUntilUtc) / 3600e3),
  };
}

/**
 * Scan every day of a year: book a clean at `cleanTime` local, run the 6 PM job
 * the evening before, and compare the correct local "tomorrow" with the naive
 * UTC one.
 */
export function yearScan({ year, tz, cleanTime = '09:00', reminderTime = '18:00' }) {
  const c = parseHHMM(cleanTime);
  const r = parseHHMM(reminderTime);
  let days = 0, naiveMissed = 0, naiveCorrect = 0, insideWindow = 0;
  const missedMonths = new Set();
  for (let date = { y: year, m: 1, d: 1 }; date.y === year; date = addDays(date, 1)) {
    days++;
    const startUtc = zonedToUtc({ ...addDays(date, 1), ...c }, tz);
    const runAtUtc = zonedToUtc({ ...date, ...r }, tz);
    const [nf, nt] = naiveTomorrowWindow(runAtUtc);
    if (startUtc >= nf && startUtc < nt) naiveCorrect++;
    else { naiveMissed++; missedMonths.add(date.m); }
    if ((startUtc - runAtUtc) / 3600e3 < 24) insideWindow++;
  }
  return { year, tz, cleanTime, reminderTime, days, naiveCorrect, naiveMissed, insideWindow, missedMonths: [...missedMonths].sort((a, b) => a - b) };
}

/**
 * Reminder wording. The blueprint fixes only the last line; the opening is my
 * draft and is marked as such on the demo page.
 */
export function reminderText({ businessName, clientFirstName, startUtc, tz, policy = DEFAULT_POLICY, freeUntilLine = false }) {
  const when = formatLocal(startUtc, tz);
  const lines = [
    `Hi ${clientFirstName}, this is ${businessName}. Reminder: your cleaning is tomorrow, ${when}.`,
  ];
  if (freeUntilLine) {
    const t = reminderTiming({ startUtc, tz, policy });
    lines.push(t.insideWindow
      ? `Free cancellation closed at ${formatClock(t.freeUntilUtc, tz)} today.`
      : `Free cancellation until ${formatLocal(t.freeUntilUtc, tz)}.`);
  }
  lines.push(reminderPolicyLine(policy));
  return lines.join(' ');
}
