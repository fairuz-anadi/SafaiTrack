# Methodology — how every number is produced

This document exists so a judge can audit the savings figures rather than take
a percentage on trust. Every constant used anywhere in SafaiTrack is declared
in `shared/types.ts` (`IMPACT_CONSTANTS`) and explained here.

---

## 1. The comparison

Whenever a route is generated, SafaiTrack computes **two** routes over the same
ward, at the same moment, with the same truck:

| | Baseline | Optimized |
|---|---|---|
| Which bins | Every active bin in the ward | Only bins ≥ threshold fill, or forecast to overflow within the lookahead window |
| Order | Static bin-code order | Dijkstra → priority-weighted nearest neighbour → 2-opt |
| Models | The paper route sheet the city runs today | SafaiTrack's plan |

Both start at the ward depot and end at the Amin Bazar landfill. The difference
between them is the saving. Nothing is estimated separately.

### Why the baseline is fair, not a strawman

The proposal's problem statement describes the current system as *"fixed,
rarely-updated schedules regardless of how full a bin actually is"*. Bin-code
order is how a paper sheet is genuinely written — by location number, not by
need. The baseline is not randomised, and it is not deliberately bad; it is
simply condition-blind, which is the actual complaint.

---

## 2. Distance

Straight-line (haversine) distance between two coordinates, multiplied by a
**road-detour factor of 1.35**.

```
roadDistanceKm(a, b) = haversineKm(a, b) × 1.35
```

Dhaka's dense, irregular street grid means a truck never drives the crow-flies
distance. A detour factor in the 1.3–1.4 range is the standard planning
allowance for dense urban grids. Using raw haversine would have *flattered*
every figure in this project, which is why the factor is applied to both routes
and stated here.

**Limitation, stated plainly:** this is a constant, not routed geometry. Real
road distances would need an OSRM or GraphHopper instance built over an
OpenStreetMap extract of Dhaka. That is the correct upgrade path, and the
routing engine's distance function is the only thing that would change.

---

## 3. Fuel, cost and CO₂

Derived from the distance difference, in that order. Nothing is estimated
independently.

```
fuelLitres   = distanceKm × truck.fuelLitresPerKm
costBdt      = fuelLitres × 105
co2Kg        = fuelLitres × 2.68
```

| Constant | Value | Source / reasoning |
|---|---|---|
| `fuelLitresPerKm` | 0.27 – 0.38 | Per truck, by size. A 7-tonne Tata LPK on stop-start municipal duty is modelled at 0.38 L/km; a 3.5-tonne Isuzu NPR at 0.27. |
| `dieselPriceBdtPerLitre` | 105 | Bangladesh retail diesel price. **Update this if the rate has moved before the event.** |
| `co2KgPerLitreDiesel` | 2.68 | Standard well-to-wheel emission factor for diesel. |

Because cost and CO₂ are both linear in fuel, and fuel is linear in distance,
**the only independent measurement in the whole chain is the distance
difference.** Everything else is arithmetic a judge can redo on paper.

---

## 4. Time

```
minutes = (distanceKm / 14) × 60  +  stops × 4
```

| Constant | Value | Reasoning |
|---|---|---|
| `avgSpeedKmh` | 14 | Average truck speed inside a dense Dhaka ward, including traffic and turns. |
| `minutesPerStop` | 4 | Crew time to service one bin. |

---

## 5. Wasted stops and overflows prevented

- **Wasted stops avoided** — bins the baseline visits that are below the
  collection threshold (default 55% fill). Sending a truck to a one-third-full
  bin is the specific inefficiency the proposal identifies, and this counts it.
- **Overflows prevented** — bins at or above 85% that the optimized route
  actually reaches. A fixed route that visits every bin runs long; anything past
  the shift cap stays overflowing until tomorrow.

---

## 6. The overflow forecast

Ordinary least-squares regression of fill % against elapsed hours, fitted per
bin over its recent readings.

```
slope = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)²        # % per hour
hoursToOverflow = (100 − currentFill) / slope
```

Three guards keep it honest:

1. **Segmentation.** A drop of more than 25 percentage points means the bin was
   emptied. Only readings since the most recent collection are fitted, so an
   emptying event cannot drag the slope negative.
2. **Confidence.** `0.15 + R² × 0.6 × w + w × 0.25`, where `w = min(1, n/12)`.
   A perfect line through 3 points scores lower than a good line through 20.
   The UI shows the confidence and the sample size next to every prediction.
3. **Refusal to guess.** A non-positive slope, or a projection beyond 7 days,
   returns `null` rather than inventing a number.

Fewer than 3 usable readings falls back to a 2.5 %/hour default at confidence
0.25 — flagged low, not presented as a prediction.

---

## 7. The simulation

Bin fill is simulated because per-bin sensors are outside the budget — the
central design premise of the proposal (§4.1).

Each tick advances the world clock by `minutesPerTick` (default 30) and grows
every active bin:

```
delta = bin.fillRatePctPerHour × hours × diurnalFactor(hour) × variance
variance ∈ [0.85, 1.15]
```

The diurnal factor models real Dhaka waste generation rather than a straight
line:

| Hours | Factor | Why |
|---|---|---|
| 00–05 | 0.25 | Overnight, almost nothing accumulates |
| 05–09 | 1.35 | Morning market |
| 09–12 | 1.05 | |
| 12–15 | 0.90 | |
| 15–19 | 1.40 | Evening peak |
| 19–22 | 1.15 | |
| 22–00 | 0.50 | |

Every tick writes a row into `bin_sensor_readings` with
`reading_source: "simulated"` — **the same table, the same shape, the same
validity flag a real ultrasonic sensor would write.** Citizen reports write to
it as `"citizen"`, drivers as `"driver"`. Swapping in real hardware means
writing `"sensor"` and changing nothing else.

**Limitation, stated plainly:** this is not a household-level waste-generation
model. It reproduces plausible operational data with a realistic daily shape;
it does not derive fill from population, income, or seasonality.

---

## 8. The annual projection

```
runsPerYear  = wardCount × 1 × 365
annualSaving = measuredSavingPerRoute × runsPerYear
```

Deliberately conservative: one optimized run per ward per day, and **no**
additional efficiency gains assumed from fleet rebalancing, crew scheduling, or
reduced complaint handling. It is a linear scale-up of a measured number, and
should be read as an order of magnitude rather than a budget line.

---

## 9. What would make these numbers stronger

Listed openly, because knowing the limits of your own evidence is part of the
engineering.

1. **Real road routing** (OSRM over a Dhaka OSM extract) instead of the 1.35
   detour factor.
2. **Real fuel telemetry** from DNCC trucks instead of published L/km figures.
3. **A field trial** — the meta-analysis this project benchmarks against reports
   that real-world deployments achieve about −12.4% versus −39.8% in simulation.
   SafaiTrack's simulated ~31% sits inside the simulation band; a real
   deployment should be expected to land lower, and claiming otherwise would be
   dishonest.
4. **Household waste-generation data** to replace the diurnal curve with a
   fitted model.
