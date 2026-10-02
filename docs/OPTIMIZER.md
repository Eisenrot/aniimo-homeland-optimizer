# How the optimizer works

This document describes the current production model behind Aniimo Homeland Optimizer: what is optimized, which constraints are enforced, why some apparently obvious plans lose, and where the model deliberately stops pretending it knows more than the game has shown us.

The short version is that the optimizer does **not** rank recipes independently. It solves the Homeland as one connected system.

A recipe can look excellent in isolation and still be a bad choice because it consumes a scarce intermediate, occupies a facility needed by another chain, needs climate coverage that does not physically fit, overloads the Crackle grid, or spends more Aniimo labor than the value it creates.

The production solve is built as a mixed-integer optimization model and solved in-browser with HiGHS.

## 1. The main decision variables

For each legal recipe execution variant, the model tracks two important quantities:

- **rate**: how many batches per hour that recipe runs;
- **active units**: how many physical copies of its facility are assigned to it.

Rates may be fractional because a machine can spend part of an hour producing something. Physical structure counts are constrained by the facility inventory and become whole numbers whenever the rules require a whole assigned copy.

E-mode recipes always use whole active facility counts because each powered structure contributes its full electrical demand to the shared grid.

The model also contains integer variables for utility structures and their modes, including Cooling Units, Heat Furnaces, Sunlamps and Crackle Generators.

## 2. Facility capacity

The optimizer cannot use structures you do not own.

For a facility and recipe level, the active units assigned to recipes requiring that level cannot exceed the number of owned copies capable of running them:

```text
sum(active units requiring level L or higher)
    <= owned facility copies at level L or higher
```

Mixed-level stacks are respected. A high-level structure may satisfy a lower-level recipe requirement; a low-level structure cannot magically run a recipe above its level.

When **One recipe per facility** is enabled, the assignment is literal: each physical copy is committed to one recipe rather than being treated as a continuously divisible pool.

## 3. Material balance

Intermediate materials do not appear from nowhere.

For every item that can be produced internally and is consumed by another active recipe, the model requires total production to cover total consumption:

```text
sum(outputs per batch × batches/h)
  - sum(inputs per batch × batches/h)
  >= 0
```

That one rule is why the optimizer can solve complete chains rather than simply sorting final recipes by displayed Coin value.

If a profitable final recipe consumes more of an intermediate than the Homeland can sustain, the solver must either produce more of that intermediate, reduce the final recipe, or choose something else.

## 4. Collection and output capacity

If you tell the optimizer that facilities are emptied every N hours, their finite output storage becomes a real constraint.

For each relevant facility tier:

```text
batches/h × collection interval
    <= total stored batches available before collection
```

So a theoretically fast recipe can stop being useful if it fills the structure before your chosen collection interval.

With no collection limit, that cap is not imposed.

## 5. Worker capacity

The theoretical Plan solve treats Aniimo as a finite labor resource.

Ordinary manual work consumes worker-hours according to its measured workload and configured efficiency:

```text
worker-hours = batches/h × manual seconds per batch / 3600
```

Some facilities are different. Resident-style structures such as Mine, Well, Dewy House, Tidewhisper Sandcastle, Nimbus Bed, Starfall Hammock and Floral Windmill reserve a physical Aniimo for every active manual facility unit. Their apparently idle time cannot be borrowed by another structure.

Utility buildings that require staffing also reserve workers. Cooling, heating, Sunlamp and Crackle Generator usage therefore compete with production for the same worker limit.

The resulting capacity rule is approximately:

```text
resident Aniimo
+ intermittent manual worker-hours
+ active utility workers
<= configured worker slots
```

The later **Team** pass is stricter: it replaces this theoretical capacity with actual owned Aniimo, copies, abilities, family restrictions and assignments.

## 6. Climate is a resource, not a checkbox

Enabling a climate utility means **the solver may use it**. It does not force the structure into the plan.

Cooling and Heat copies can independently choose their intensities. Climate fields also obey the observed overlap rules:

- Freeze + Warm can create a Cool intersection;
- Cool + Scorching can create a Warm intersection;
- Freeze + Scorching does not automatically create a useful intermediate climate.

The optimization model proposes climate-sensitive structure counts and utility modes. A separate geometry layer then checks whether those structures can actually be covered by the available physical fields.

If the proposed arrangement cannot fit, the solver adds a cut excluding that failed configuration and solves again. It is allowed to repair the plan by changing utility counts, modes, overlaps or climate-sensitive production.

That matters because “one Cooling Unit exists” and “all twelve structures that need Cool can physically fit in its field” are not the same statement.

## 7. Electricity and the shared Crackle grid

Electrical production is one shared grid, not a per-machine buff.

Each active E-mode facility contributes its full facility-level power demand. Generator supply depends on the number and level of active Crackle Generators.

The grid efficiency used by the optimizer is:

```text
eta = min(1.20, total generator power / total active E-mode demand)
```

and the effective E-mode cycle is:

```text
effective seconds = base E-mode seconds / eta
```

So:

- below 100% grid efficiency, every powered recipe slows down;
- above 100%, powered recipes speed up;
- the observed cap is 120%;
- adding another electrical structure can make the entire powered grid worse.

An **active** E-mode facility means a physical facility copy assigned to an E-mode recipe. It contributes its full electrical demand even if that recipe is not using every possible second of the hour.

This is why “electrify everything” is not a valid optimization strategy.

### Why the electrical model uses binary decomposition

The awkward part is that E-mode throughput depends on both grid efficiency and the number of active powered units. Multiplying two decision variables directly would make the model nonlinear.

Instead, each electric recipe's whole active-unit count is binary-decomposed and the products between those bits and the shared efficiency variable are linearized.

Conceptually, the important constraints become:

```text
eta × total power demand <= generator supply

recipe rate × base cycle
    <= eta × active powered units
```

This keeps the shared-grid behavior inside one mixed-integer linear model without enumerating every possible power-demand state.

## 8. Electrical Automation versus Max Electrical Coverage

These are deliberately two different preferences.

### Electrical Automation

Normal Electrical Automation first solves the economic problem normally. It then protects the achieved value of every active objective at essentially 100% and runs a tie-break pass that:

- rewards actual E-mode throughput;
- penalizes manual Aniimo labor.

This means it can choose a more automated version of an economically equivalent plan, but it is not allowed to meaningfully sacrifice the objective just to make more lightning icons appear.

### Max Electrical Coverage

Max Electrical Coverage is the aggressive version.

It is only available when Electrical Automation is enabled. After the economic solution is known, every active objective is protected at **97%** of the value it achieved in that pre-automation solution:

```text
objective after automation >= 0.97 × pre-automation achieved value
```

Hard minimum requirements remain hard constraints and are not relaxed.

Inside that 3% headroom, the solver again rewards real E-mode occupancy and reduced manual labor. It can therefore accept a small economic loss when doing so meaningfully reduces the Aniimo needed to operate the plan.

The 97% value is intentional: it keeps the chosen economic compromise recognizably intact while giving the solver enough room to find materially different staffing/electrical arrangements.

## 9. Objectives and multiple MAX targets

A single target is straightforward: maximize its objective vector subject to every physical and production constraint.

Multiple MAX objectives need more care. Simply adding their raw values together would let a large-number objective dominate a small-number one.

The solver therefore works in stages.

First, each active objective is calibrated independently to find its own achievable maximum.

For each objective:

```text
normalizer = abs(individual maximum)
normalized achievement = current value / normalizer
```

The model then maximizes a shared fairness variable representing the minimum normalized share preserved across all objectives.

In plainer English:

> maximize the percentage of each objective's individual best result that can survive at the same time.

After that best common share is fixed, the solver maximizes the normalized sum of the objectives without giving up the established fairness floor.

This is why one MAX target should not simply devour the others because its raw numeric scale is larger.

Hard minimum requirements are different from MAX objectives: they are inserted directly as lower-bound constraints and must be satisfied for the plan to be feasible.

## 10. Team optimization is a separate question

The production MIP answers:

> What is the best legal production configuration within the theoretical worker limit?

The Team pass asks a stricter version of the same optimization problem:

> What is the best legal production configuration my actual Owned Aniimo can run?

Team therefore runs Solver Next again with roster-aware staffing constraints while reusing the Plan solve's objective normalizers. The economic intent stays the same; the available labour becomes concrete.

The roster-aware model selects **up to** the configured Aniimo cap from enabled copies and assigns actual worker time to recipe tasks. Ability levels gate jobs, measured-efficiency recipes use the selected worker's real speed, resident jobs reserve a compatible worker for the full hour, and climate/electrical utilities reserve qualified full-time workers. Resident-family recipes such as Susuta's Tidewhisper Sandcastle work require the correct family rather than any vaguely leisure-shaped volunteer.

All of the normal production constraints remain active in this second solve: material balance, facility counts and levels, collection limits, one-recipe-per-facility, climate geometry, the shared Crackle grid, hard minimums and the multi-MAX fairness policy. A higher Aniimo cap expands the feasible set; it does not force extra workers into the result.

For performance, workers that are mathematically identical for every currently runnable task are grouped into exact archetypes inside the MIP, then expanded back into real owned copies for the Team UI. Strictly dominated archetypes are removed only when enough better substitutes already exist to fill the entire team cap. No top-N candidate heuristic is used.

The Team result may exceed the theoretical Plan rate when the owned roster contains workers whose actual Homeland ability levels are faster than the required-level baseline used by the theoretical pass. Personality is recommended afterward and is not silently counted as a production bonus.

## 11. Physical layout

The final layout is not drawn from abstract structure counts alone.

`src/full-layout.js` places real structure footprints on the RV plot grid, respects disabled plots and rotation rules, places climate utilities, validates their coverage, and constructs connected Crackle Generator / Power Pole coverage for active E-mode structures.

The power graph matters: a Power Pole must itself overlap an already powered Generator or Pole field before it can extend the network.

The layout pass uses the structures actually required by the production solution rather than blindly placing every owned structure.

## 12. What the optimizer deliberately does not assume

Several controls are permissions or observations, not magical guarantees:

- **Available utility buildings are not forced placements.** The solver uses only the copies it needs.
- **An unlocked recipe is not automatically considered read.** Recipe Notes can gate recipes explicitly.
- **Electrical coverage does not mean 120% efficiency.** Efficiency comes from shared supply versus active demand.
- **Owned Aniimo are not interchangeable worker tokens.** The Team pass respects abilities, copies and restrictions.
- **Abstract climate demand is not assumed to fit physically.** Geometry validates it and can reject the MIP proposal.
- **A facility being owned does not mean it must be active.** Unused structures cost no production capacity merely because they exist.
- **The layout engine is not claimed to reproduce undocumented game collision rules.** Where the game has not exposed a rule, the project does not invent certainty.

## 13. Independent validation

The production solver does not simply return a HiGHS solution and trust it.

Before a plan is accepted, `validateNextPlan()` independently recomputes and checks:

- whole-unit requirements where applicable;
- facility level/copy capacity;
- material balances;
- hard minimum guarantees;
- electrical demand, supply and grid efficiency;
- E-mode cycle times;
- worker capacity;
- climate geometry feasibility;
- reported Home Coin rate.

A validation failure is surfaced as a solver failure rather than silently shipping a mathematically inconsistent production sheet.

## 14. Where the code lives

The main pieces are:

- `src/solver-next/model.js` — mixed-integer model construction;
- `src/solver-next/roster.js` — Owned Aniimo archetypes, job eligibility and real worker-speed helpers;
- `src/solver-next/solve.js` — staged objectives, climate-cut loop and plan reconstruction;
- `src/solver-next/domain.js` — recipe timing, facility stacks and domain helpers;
- `src/solver-next/validate.js` — independent post-solve validation;
- `src/climate.js` — climate geometry;
- `src/utility-system.js` — utility progression, generator power and grid arithmetic;
- `src/full-layout.js` — complete physical Homeland placement;
- `src/optimizer.js` — shared recipe calculations and real-team/staffing logic.

For implementation-specific notes on the HiGHS formulation, see [the Solver Next notes](../src/solver-next/README.md).

## 15. A note on certainty

Some parts of this model are direct arithmetic from observed game values; some are reconstructed rules verified against in-game behavior; and physical placement necessarily depends on the collision/coverage rules we currently know.

When new evidence contradicts the model, the intended response is to update the model and its regression tests, not defend an old assumption because it happens to make a prettier number.
