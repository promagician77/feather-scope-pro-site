// Cancellation policy maths (blueprint Screen 4, page 22).
//
// Policy text (default): "Please cancel or reschedule at least 24 hours before
// your cleaning. Cancellations with less than 24 hours' notice are charged 25%
// of the scheduled cleaning fee."
//
// The blueprint stores the policy as free text (businesses.cancellationPolicy)
// while the reminder line is fixed. The two numbers are kept as numbers here
// so the quote line, the reminder line and the fee always agree.

export const DEFAULT_POLICY = Object.freeze({ windowHours: 24, percent: 25 });

export const DEFAULT_POLICY_TEXT =
  "Please cancel or reschedule at least 24 hours before your cleaning. " +
  "Cancellations with less than 24 hours' notice are charged 25% of the scheduled cleaning fee.";

export function reminderPolicyLine({ windowHours, percent } = DEFAULT_POLICY) {
  return `Need to cancel? Please let us know as soon as you can - cancellations with less than ${windowHours} hours' notice are charged ${percent}% of the cleaning fee.`;
}

/**
 * Fee for a cancellation. "At least 24 hours before" is free, so exactly
 * 24:00:00 of notice is free and anything less is charged.
 */
export function cancellationCharge({ feeCents, startUtc, cancelledAtUtc, policy = DEFAULT_POLICY }) {
  if (!Number.isInteger(feeCents) || feeCents < 0) throw new Error('feeCents must be a whole number of cents');
  const noticeMs = startUtc - cancelledAtUtc;
  const charged = noticeMs < policy.windowHours * 3600e3;
  const chargeCents = charged ? Math.round((feeCents * policy.percent) / 100) : 0;
  return {
    noticeHours: noticeMs / 3600e3,
    charged,
    afterStart: noticeMs <= 0,
    chargeCents,
    freeUntilUtc: startUtc - policy.windowHours * 3600e3,
  };
}

/** Numbers that appear in a free-text policy, to catch text/number drift. */
export function policyNumbersInText(text) {
  const hours = [...String(text).matchAll(/(\d+)\s*(?:-\s*)?hours?/gi)].map((m) => +m[1]);
  const percents = [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => +m[1]);
  return { hours: [...new Set(hours)], percents: [...new Set(percents)] };
}

/** True when the edited text no longer states the numbers the app charges and texts. */
export function policyTextDrift(text, policy = DEFAULT_POLICY) {
  const { hours, percents } = policyNumbersInText(text);
  const problems = [];
  if (!hours.length) problems.push('The text states no notice period.');
  else if (hours.some((h) => h !== policy.windowHours))
    problems.push(`The text says ${hours.join('/')} hours; reminders and fees use ${policy.windowHours}.`);
  if (!percents.length) problems.push('The text states no fee percentage.');
  else if (percents.some((p) => p !== policy.percent))
    problems.push(`The text says ${percents.join('/')}%; reminders and fees use ${policy.percent}%.`);
  return problems;
}
