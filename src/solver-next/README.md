# Solver Next

Current HiGHS-backed Homeland production solver.

The React application uses this model through `modern/engine/solverNext.worker.ts`. The directory also exposes a direct API, validator, and benchmark tooling for regression work.

## Core model

Solver Next uses the installed `highs@1.15.3` WebAssembly MIP solver.

The model contains the structural Homeland decisions directly:

- integer Cooling Unit counts split independently between Cool and Freeze;
- integer Heat Furnace counts split independently between Warm and Scorching;
- integer Sunlamp and Crackle Generator counts;
- exact overlap counts for:
  - Freeze + Warm -> Cool
  - Cool + Scorching -> Warm
- one continuous rate variable per legal recipe execution variant;
- whole recipe-unit counts when one-recipe-per-facility is enabled;
- whole active electric-facility counts even outside one-recipe mode, because assigning an E-mode recipe consumes grid power;
- facility-level capacity constraints;
- material balances;
- collection/output limits;
- hard objective floors;
- worker capacity including each utility building actually used;
- primary + co-max calibration;
- max-min fairness followed by normalized-sum tie breaking.

The user's utility controls are **availability caps**, not forced placements. For example, Cooling `1 / 2` means Solver Next may use at most one of the two Cooling Units unlocked at that RV level.

## Electricity

Canonical utility data lives in `src/utility-system.js`.

Crackle geometry:

- Generator: 2x2 footprint, 11x11 influence field.
- Power Pole: 1.5x1.5 footprint, 7x7 influence field.
- Any positive overlap with a powered field is sufficient.
- A pole must overlap an already powered Generator/Pole field, so poles form a real connected relay chain.
- Layout uses zero poles when the Generator field already reaches every E-mode structure; otherwise it adds the minimum useful relays up to the selected pole cap.

Generator output by level:

- Lv.1: 600
- Lv.2: 800
- Lv.3: 1000
- Lv.4: 1200
- Lv.5: 1500

Grid efficiency is:

```text
eta = min(1.2, total generator power / total active E-mode power demand)
actual E-mode seconds = base E-mode seconds / eta
```

"Active" means a physical facility copy with an E-mode recipe assigned. It consumes its facility-level power demand even if that recipe is momentarily idle.

The live in-game observation used to verify this was:

- listed powered facilities: 570 total demand;
- one Lv.1 Generator: 600 supply;
- 600 / 570 = 105.263%;
- add another 75-power facility: 600 / 645 = 93.023%;
- Ginseng Porridge E-mode base timer: 108 seconds;
- 108 / 1.05263 = 102.6 seconds = ~1m42.6s.

Those values reproduce the observed 105%, 93%, and 1m42-43s exactly.

### MIP formulation for shared grid efficiency

A naive enumeration of every possible grid-demand state caused more than 15k constraints and was discarded.

The current compact formulation has one continuous `eta` in `[0, 1.2]`. Each electric recipe's whole active-unit count is binary-decomposed. Standard binary-product linearization creates `eta * active_units` terms, allowing the shared grid law to remain linear:

```text
eta * total power demand <= generator_count * generator_power(level)
rate * base_cycle <= eta * active_units
```

This keeps the model in the hundreds rather than tens of thousands of rows.

## Climate fields

Climate utility placement caps come from the extracted current Homeland data and are centralized in `src/utility-system.js`.

At RV13:

- Cooling Unit: 2 max
- Heat Furnace: 2 max
- Sunlamp: 2 max
- Crackle Generator: 1 max
- Crackle Power Pole: 6 max

Every Cooling/Heat/Sunlamp copy is an independent physical field.

The overlap rules are deliberately asymmetric and match the game behavior:

- Freeze Cooling + Warm Heat -> Cool intersection.
- Cool Cooling + Scorching Heat -> Warm intersection.
- Freeze + Scorching does **not** create an intermediate climate.

The multi-field climate validator treats every physical 9x9 field as a separate packing resource. One demand group may be split across multiple fields when necessary. Mixed-mode copies are valid, e.g. one Cooling Unit on Freeze and a second on Cool.

## Climate geometry cuts

The existing geometry engine remains the physical source of truth in this first solver.

HiGHS proposes the globally optimized whole-unit production plan. Geometry checks the selected utility counts/modes and structure assignment. If packing fails, Solver Next adds a conditional no-good/disjunctive cut to the same persistent MIP. A later solve may repair the failure by changing:

- utility counts;
- Cooling/Heat modes;
- overlap-pair counts;
- or climate-sensitive structure counts.

The failed physical configuration is excluded without greedily capping every climate group.

This remains the seam where a precomputed coverage catalogue could later replace the iterative geometry bridge.

## Physical layout

`src/full-layout.js` now understands:

- multiple independent climate clusters;
- per-field temperature metadata;
- real 2x2 Generator placement;
- real 11x11 Generator influence;
- 1.5x1.5 Power Pole placement;
- 7x7 Pole influence;
- connected power-relay chains;
- hard rejection when an E-mode structure is outside the powered graph.

The viewer renders power fields separately from the temperature palette.

## Files

- `domain.js` - Homeland domain helpers and recipe/electric metadata.
- `model.js` - sparse MIP construction.
- `climate-cuts.js` - geometry validation and dynamic MIP cuts.
- `solve.js` - multi-stage objective solving and plan reconstruction.
- `validate.js` - independent post-solve validation including grid arithmetic.
- `sparse.js` - sparse matrix helpers.
- `highs-runtime.js` - cached HiGHS WASM loader.
- `index.js` - public solver API.

## Compatibility boundary

Solver Next still reuses recipe timing, weather, ability-ceiling, and value calculations from `src/optimizer.js` while the search engine changes. That keeps comparisons focused on search architecture instead of silently changing unrelated game rules.

The returned object follows the current optimizer-plan shape: `ratePerHour`, `targetRate`, `rows`, `scenario`, `climateLayout`, `objectiveWeights`, and `optimizerStats`.

The modern production worker consumes the numeric utility availability caps directly, including multiple utility copies and shared electric-grid math.

## Benchmarks

```bash
npm run benchmark:next
npm run benchmark:next -- --state path/to/state.json
npm run benchmark:next -- --state path/to/state.json --old
```

Useful flags:

```bash
--time-limit 8
--climate-cuts 24
--progress
```

Current development measurements:

- default RV8: roughly 50-60 ms, gap 0, validation OK;
- current RV13 live state with co-max objectives, utility geometry, and shared power-grid formulation: roughly 8 seconds, about 850 columns x 1000 rows, gap 0, validation OK;
- previous exhaustive search observed for that class of state: more than 120 seconds before finishing all scenarios.

These are development-machine measurements, not performance guarantees.