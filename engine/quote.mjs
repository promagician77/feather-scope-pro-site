// Quote maths (blueprint Screen 4, pages 20-21). Whole cents throughout.
//
// "Quote maths, in order: 1) Base price for the service type (or hours x
// rate). 2) If below $100, raise to $100. 3) Add selected add-ons at the
// service-area price. 4) Show base, add-ons, and total as separate lines."

export const SERVICE_TYPES = ['Regular', 'Standard', 'Deep', 'Construction', 'One-Time', 'Spring/Fall', 'Commercial', 'Airbnb'];
export const EXCLUDED_ITEMS = ['Dishes', 'Making beds', 'Laundry', 'Pet waste cleanup', 'Bodily fluids'];
export const SCOPE_SENTENCE = 'We do not do: dishes, making beds, laundry, pet waste cleanup, or bodily fluids';

/**
 * Feather Lady's starting numbers from the blueprint. Add-on and upsell prices
 * are NOT in the blueprint: they are null here and the demo asks for them.
 * Prices are keyed by area name, not by field names such as
 * addon_oven_eastMadison, so a business in Middleton can store its own areas.
 */
export const FEATHER_PRICING = Object.freeze({
  hourlyCents: 5000,
  minimumCents: 10000,
  base: { Standard: 16500, Deep: 26400, Construction: 68000, 'One-Time': 20600, 'Spring/Fall': 28000, Commercial: 33500, Airbnb: 18500 },
  perTurnover: ['Airbnb'],
  areas: ['East Madison', 'Cottage Grove', 'Sun Prairie'],
  addons: {
    oven: { label: 'Inside of oven', enabled: true, prices: { 'East Madison': null, 'Cottage Grove': null, 'Sun Prairie': null } },
    stairs: { label: 'Stairs', enabled: true, prices: { 'East Madison': null, 'Cottage Grove': null, 'Sun Prairie': null } },
    appliances: { label: 'Inside of appliances', enabled: true, prices: { 'East Madison': null, 'Cottage Grove': null, 'Sun Prairie': null } },
  },
  upsellPrices: { Dishes: null, 'Making beds': null, Laundry: null, 'Pet waste cleanup': null, 'Bodily fluids': null },
});

export function withSamplePrices(pricing, samples) {
  const p = structuredClone(pricing);
  for (const [key, byArea] of Object.entries(samples.addons || {})) Object.assign(p.addons[key].prices, byArea);
  Object.assign(p.upsellPrices, samples.upsellPrices || {});
  return p;
}

export function quoteTotal(pricing, { serviceType, hoursEst = 0, turnovers = 1, serviceArea, addons = [] }) {
  const issues = [];
  if (!SERVICE_TYPES.includes(serviceType)) throw new Error(`Unknown service type: ${serviceType}`);
  if (!pricing.areas.includes(serviceArea)) throw new Error(`Unknown service area: ${serviceArea}`);

  let baseCents, basis;
  const fixed = pricing.base[serviceType];
  if (Number.isInteger(fixed)) {
    if (pricing.perTurnover.includes(serviceType)) {
      baseCents = fixed * Math.max(1, Math.floor(turnovers));
      basis = `${Math.max(1, Math.floor(turnovers))} turnover(s) x $${fixed / 100}`;
    } else {
      baseCents = fixed;
      basis = `${serviceType} price`;
    }
  } else {
    // "Regular" has no price in My Pricing; the blueprint does not say which
    // types are hourly, so a type without a set price is priced by the hour.
    baseCents = Math.round(hoursEst * pricing.hourlyCents);
    basis = `${hoursEst} h x $${pricing.hourlyCents / 100}/h`;
    issues.push(`${serviceType} has no set price in the blueprint, so it is priced by the hour.`);
  }
  const minimumApplied = baseCents < pricing.minimumCents;
  if (minimumApplied) baseCents = pricing.minimumCents;

  const addonLines = [];
  for (const key of addons) {
    const a = pricing.addons[key];
    if (!a) throw new Error(`Unknown add-on: ${key}`);
    if (!a.enabled) { issues.push(`${a.label} is switched off and cannot be quoted.`); continue; }
    const price = a.prices[serviceArea];
    if (!Number.isInteger(price)) { issues.push(`${a.label} has no price for ${serviceArea} yet.`); continue; }
    addonLines.push({ key, label: a.label, cents: price });
  }
  const addonsCents = addonLines.reduce((s, l) => s + l.cents, 0);
  return {
    lines: [
      { label: `Base (${basis}${minimumApplied ? ', raised to the $' + pricing.minimumCents / 100 + ' minimum' : ''})`, cents: baseCents },
      ...addonLines.map((l) => ({ label: `${l.label} - ${serviceArea}`, cents: l.cents })),
    ],
    baseCents,
    addonsCents,
    totalCents: baseCents + addonsCents,
    minimumApplied,
    issues,
  };
}

/** The scope-upsell list: the five excluded items plus switched-on add-ons at this client's area price. */
export function upsellOffers(pricing, serviceArea, alreadyOffered = []) {
  const offered = new Set(alreadyOffered);
  const items = [
    ...EXCLUDED_ITEMS.map((label) => ({ itemLabel: label, itemSource: 'excluded', cents: pricing.upsellPrices[label] })),
    ...Object.values(pricing.addons)
      .filter((a) => a.enabled)
      .map((a) => ({ itemLabel: a.label, itemSource: 'optionalAddon', cents: a.prices[serviceArea] })),
  ];
  return items.filter((i) => !offered.has(i.itemLabel));
}

export const usd = (cents) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
