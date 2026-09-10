/**
 * Overflow forecasting.
 *
 * The proposal plans routes reactively — it collects bins that are already
 * full. This module lets the system plan *before* overflow: it fits each
 * bin's recent sensor readings to a fill rate and projects when the bin will
 * cross 100%.
 *
 * Method: ordinary least-squares linear regression of fill % against elapsed
 * hours, fitted per bin over its recent readings, with collection events
 * (where fill drops sharply) treated as segment boundaries so an emptying
 * event does not drag the slope negative.
 */

export interface Reading {
  recordedAt: string;
  fillLevelPercent: number;
}

export interface Forecast {
  fillRatePctPerHour: number;
  hoursToOverflow: number | null;
  predictedOverflowAt: string | null;
  confidence: number;
  sampleSize: number;
  /** The last fill level anybody actually reported, and when. */
  observedFillPercent: number | null;
  observedAt: string | null;
  /** How long the bin has gone unobserved. Null when it has no readings. */
  hoursSinceObservation: number | null;
  /**
   * The observation carried forward at the fitted rate.
   *
   * Nothing measures a bin between reports, so any fill level quoted for
   * "now" is inference. Making that inference explicit — and projecting the
   * overflow from it rather than from a stored column that only the
   * simulation advances — is what stops the displayed level and the forecast
   * being able to describe two different bins.
   */
  estimatedFillPercent: number;
}

/** Fill rate assumed for a bin with too little history to fit. */
const DEFAULT_RATE_PCT_PER_HOUR = 2.5;
/** A drop of more than this many points means the bin was emptied. */
const COLLECTION_DROP_THRESHOLD = 25;

export function forecastBin(
  currentFillPercent: number,
  readings: Reading[],
  asOf: Date = new Date()
): Forecast {
  const segment = latestFillSegment(readings);

  // `latestFillSegment` sorts ascending, so the last entry is the most recent
  // thing anyone reported about this bin.
  const newest = segment[segment.length - 1];
  const observedFillPercent = newest?.fillLevelPercent ?? null;
  const observedAt = newest?.recordedAt ?? null;
  const hoursSinceObservation = newest
    ? Math.max(0, (asOf.getTime() - new Date(newest.recordedAt).getTime()) / 3_600_000)
    : null;

  /**
   * Carry the observation forward at `rate`. With no reading to anchor to
   * there is nothing to extrapolate from, so the stored level is all we have
   * — and a fresh reading extrapolates by zero hours, which is why this is a
   * no-op whenever a bin was just reported or just ticked.
   */
  const estimateFrom = (rate: number) =>
    observedFillPercent === null
      ? currentFillPercent
      : clamp(round1(observedFillPercent + rate * (hoursSinceObservation ?? 0)), 0, 100);

  if (segment.length < 3) {
    // Not enough history — fall back to the default rate, and say so through
    // a low confidence rather than pretending to a prediction.
    const rate = DEFAULT_RATE_PCT_PER_HOUR;
    const estimatedFillPercent = estimateFrom(rate);
    return {
      ...projectOverflow(estimatedFillPercent, rate, asOf),
      fillRatePctPerHour: rate,
      confidence: 0.25,
      sampleSize: segment.length,
      observedFillPercent,
      observedAt,
      hoursSinceObservation: hoursSinceObservation === null ? null : round2(hoursSinceObservation),
      estimatedFillPercent,
    };
  }

  const t0 = new Date(segment[0].recordedAt).getTime();
  const points = segment.map(r => ({
    x: (new Date(r.recordedAt).getTime() - t0) / 3_600_000, // hours
    y: r.fillLevelPercent,
  }));

  const { slope, r2 } = linearRegression(points);

  // A non-positive slope means the bin is not filling in any measurable way.
  // Report the fitted rate honestly and decline to predict an overflow.
  const rate = slope > 0.05 ? slope : 0;

  // Confidence blends goodness-of-fit with sample size — a perfect line
  // through 3 points is less trustworthy than a good line through 20.
  const sampleWeight = Math.min(1, points.length / 12);
  const confidence = clamp(0.15 + r2 * 0.6 * sampleWeight + sampleWeight * 0.25, 0, 0.97);

  const estimatedFillPercent = estimateFrom(rate);

  return {
    ...projectOverflow(estimatedFillPercent, rate, asOf),
    fillRatePctPerHour: round3(rate),
    confidence: round3(confidence),
    sampleSize: points.length,
    observedFillPercent,
    observedAt,
    hoursSinceObservation: hoursSinceObservation === null ? null : round2(hoursSinceObservation),
    estimatedFillPercent,
  };
}

function projectOverflow(
  currentFillPercent: number,
  ratePctPerHour: number,
  asOf: Date
): Pick<Forecast, "hoursToOverflow" | "predictedOverflowAt"> {
  if (currentFillPercent >= 100) {
    return { hoursToOverflow: 0, predictedOverflowAt: asOf.toISOString() };
  }
  if (ratePctPerHour <= 0) return { hoursToOverflow: null, predictedOverflowAt: null };
  const hours = (100 - currentFillPercent) / ratePctPerHour;
  // Beyond a week the projection is meaningless at this granularity.
  if (hours > 168) return { hoursToOverflow: null, predictedOverflowAt: null };
  return {
    hoursToOverflow: round2(hours),
    predictedOverflowAt: new Date(asOf.getTime() + hours * 3_600_000).toISOString(),
  };
}

/**
 * Return only the readings since the most recent collection. A bin emptied
 * three hours ago should be modelled on the three hours of refilling since,
 * not on the whole week including the drop.
 */
function latestFillSegment(readings: Reading[]): Reading[] {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  let start = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].fillLevelPercent - sorted[i].fillLevelPercent > COLLECTION_DROP_THRESHOLD) {
      start = i;
    }
  }
  return sorted.slice(start);
}

/** OLS fit of y = slope·x + intercept, plus the coefficient of determination. */
function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.x - meanX) * (p.y - meanY);
    sxx += (p.x - meanX) ** 2;
  }
  if (sxx === 0) return { slope: 0, intercept: meanY, r2: 0 };

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : clamp(1 - ssRes / ssTot, 0, 1);

  return { slope, intercept, r2 };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
