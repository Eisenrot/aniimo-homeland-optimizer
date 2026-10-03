# Aniimo Homeland Optimizer

<p align="center">
  <strong><a href="https://eisenrot.github.io/aniimo-homeland-optimizer/">Open the optimizer</a></strong>
</p>

Homeland is simple until you actually try to optimize it.

Then you're balancing facilities, recipe chains, climate, electricity, Recipe Notes, worker abilities, personalities, storage, and whether the "best" production sheet can actually be run by the Aniimo you own.

So I made the calculator do the annoying part.

**It works. Who cares how.**

## What it does

Give it your actual Homeland setup and it can work out:

- the best Home Coin production plan
- material targets, hard minimums, and multiple **MAX** objectives
- full input/output chains rather than pretending intermediate materials appear from nowhere
- facility counts, levels, modules, Recipe Notes, and collection limits
- climate fields and utility-building requirements
- shared Crackle-grid power, E-mode efficiency, and electrical automation
- one-recipe-per-facility constraints
- physical structure counts actually required by the plan
- whether the plan is feasible with your real Aniimo roster
- a generated physical Homeland layout using the structures and utilities the plan actually needs

If an objective cannot be reached, the optimizer tries to expose the constraint instead of handing you a zero and expecting divination.

## How the optimizer thinks

The optimizer does not rank recipes independently. It solves the Homeland as one connected system.

A recipe can be excellent on paper and still lose because its input chain cannot sustain it, it consumes a scarce facility, its climate demand does not physically fit, it overloads the Crackle grid, or it costs too much Aniimo labor.

In broad strokes:

- recipe rates are limited by the physical facility copies and levels you own
- internally produced inputs must balance across the complete production chain
- collection intervals impose real output-storage limits
- climate utilities are finite physical fields, and impossible coverage layouts are rejected
- electrical structures share one Crackle grid rather than receiving independent power buffs
- Aniimo labor is finite; resident facilities and staffed utilities reserve workers differently from intermittent work
- multiple MAX objectives are calibrated separately, then balanced by the share of each objective's own achievable maximum
- the final solution is independently validated before it is accepted

For the equations, solve stages, electrical model, 97% automation rule, climate cuts, staffing assumptions, and validation pass, see **[How the optimizer works](docs/OPTIMIZER.md)**.

## Plan

The Plan page is the production model itself.

It supports Home Coin or item targets, minimum requirements, co-MAX objectives, facility inventory, modules, Recipe Notes, utility availability, climate controls, collection limits, and electrical optimization.

**Electrical automation** prefers E-mode while preserving the economic result. **Max electrical coverage** may use the 97% objective floor to push more structures onto electricity and reduce staffed production where the shared Crackle grid still makes that worthwhile.

Utility counts are availability caps, not forced placements. If you own two Cooling Units, telling the solver it may use two does not mean it must place both.

### Electricity, specifically

Electrical structures share one grid:

```text
efficiency = min(120%, generator power / active E-mode demand)
```

Every active E-mode structure contributes its full power demand. Adding another powered structure can therefore slow every electrical recipe already on the grid.

**Electrical automation** searches for a more automated plan without meaningfully sacrificing the active objectives. **Max electrical coverage** may instead keep each active objective at no less than 97% of its value in the solved economic plan when the trade can reduce Aniimo labor.

So no, the lightning checkbox is not secretly just `+20% speed go brrr`.

## Team

The theoretical production solve answers:

> What is the best legal production plan under the configured worker capacity?

The Team pass answers a different question:

> Which Aniimo I actually own should run **this Plan**?

Team keeps the visible Plan's active recipes, physical facility allocation, manual/E-mode split, and utility setup locked. It then solves the staffing problem with enabled Aniimo copies, real Homeland abilities, resident-family restrictions, dedicated utility jobs, and measured efficiency.

Higher-skill workers may make those same assigned structures run faster, so Team throughput can exceed the theoretical Plan baseline. What Team may **not** do is quietly drop a recipe, swap a normal structure to E-mode, repurpose a facility, or rebuild the Homeland into a different production plan just because that would score better with the roster. If the enabled roster cannot fully staff the current Plan within the configured Aniimo cap, Team reports that instead of inventing a replacement plan.

The configured Aniimo number is a cap, not a compulsory headcount. The result includes the staffed-plan rate, selected workers, facility assignments, and ability coverage. Personality remains a recommendation layer rather than a hidden production bonus.

## Layout

The Layout page turns the current production sheet into physical Homeland geometry.

It understands:

- the RV plot grid
- real structure footprints and optional rotation
- disabled plots
- climate utility fields and overlap rules
- multiple utility copies
- Crackle Generator and Power Pole coverage
- connected electrical relay chains
- Storage Units
- only the production structures currently required by the plan

The layout model is still a planner rather than a stolen copy of Aniimo's placement code. If the game contains an undocumented collision quirk, alas, the optimizer remains tragically unable to read the developers' minds.

## What the optimizer does not assume

A few easy-to-misread settings are deliberately conservative:

- enabling a utility means it **may** be used, not that it is forced into the plan
- owning a facility does not mean the solver has to activate it
- electrical coverage does not imply 120% efficiency; the whole active grid shares supply
- unlocked recipes can still be disabled by unread Recipe Notes
- abstract climate demand is not assumed to fit physically; the geometry layer has to prove it
- the theoretical worker limit does not pretend every Aniimo is interchangeable; the Team pass checks the actual roster

## Data and state

The application is fully client-side. Solver work runs in Web Workers and settings are stored locally in the browser.

Presets can be saved locally or shared through a compact URL payload. Owned Aniimo data stays local and is not included in shared plan presets.

## Running locally

Install dependencies and start Vite:

```bash
npm ci
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

The generated static site is written to `dist/`.

## Project layout

```text
modern/                    React + TypeScript application
modern/components/         Plan controls, dialogs and shared UI
modern/pages/              Plan, Team and Layout surfaces
modern/engine/             Web Worker clients and worker entrypoints

src/solver-next/           HiGHS-backed production MIP
src/optimizer.js           shared recipe/staffing/team logic
src/climate.js             climate rules and geometry constraints
src/full-layout.js         complete Homeland placement engine
src/utility-system.js      utility caps, Crackle power and progression rules
src/progression.js         RV progression helpers
src/data.js + src/data/    game-data assembly and source tables
docs/OPTIMIZER.md          model, equations and design rationale

scripts/                   solver benchmarks
test*.mjs                  regression and parity checks
.github/workflows/         verification + GitHub Pages deployment
```

The three old route files `optimizer.html`, `homeland.html`, and `roster.html` remain as tiny redirects so older bookmarks do not break.

## Thanks

A few community resources made the less glamorous parts of this project considerably easier:

- **[Aniidex](https://aniidex.com/)** — roster and form data, Homeland ability references, Aniimo portraits, and a very useful cross-check while reconciling the selectable roster.
- **[Hideout](https://www.hideoutgacha.com/)** — Homeland/item references and several of the game assets used throughout the interface.

Genuinely, thank you. Maintaining clean game data is thankless work right up until someone else needs it very badly.

## Data & attribution

This is an unofficial community tool for **Aniimo**.

Aniimo names, game data, and game imagery belong to their respective owners. External community data and assets remain the property of their respective creators and sources.

The optimizer, staffing model, layout engine, UI, and additional planning logic in this repository are independent community work.
