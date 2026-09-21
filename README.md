# Aniimo Homeland Optimizer

> Aniimo Homeland, minus the guesswork. Real staffing, personality-aware optimization, anti-stall planning, and production math that actually respects the workers doing the job.

A standalone, client-side Homeland optimizer for **Aniimo**. It does the production planning itself, then goes further by asking whether the concrete Aniimo you actually own can sustain or improve that plan.

## What it does

- Solves the best production chain across your facilities, levels, modules, speed percentages and theoretical worker cap.
- Optimizes either **Home Coin or a specific material**, including progression materials that do not sell.
- Supports hard **“also make at least”** constraints, so progression output can be protected while the remaining economy is optimized.
- Treats **Cooling Unit, Heat Furnace, Sunlamp and Crackle Generator as optional possibilities**: enabling one means the solver may use it, not that it is forced into the winning setup.
- Tests climate / temperature scenarios and only pays their station-slot cost when the winning solution actually uses them.
- Supports **collection intervals** so finite facility output storage can cap unattended production.
- Supports **One recipe per facility** for walk-away setups, while mixed mode remains the unconstrained mathematical maximum.
- Infers **resident-family production automatically** from the Aniimo roster. There is no second ownership checklist for Dewy, Susuta, Celestis, Iris, Nimbi, Shelly, Flutternym, or future equivalents present in the data.
- Keeps separate **Theoretical plan Aniimo** and **Real team Aniimo** counts.
- Re-optimizes the full runnable recipe space around a **real team**, using actual enabled copies, ability levels, family restrictions and utility jobs instead of merely checking whether the roster can imitate the generic plan.
- Finds legal personality recommendations using E/I · N/S · F/T · J/P. Primary-role traits are marked as required, useful secondary traits as optional, and irrelevant pairs as `o` rather than inventing a fake complete personality.
- Adds a subordinate **anti-stall basic-material objective** after the economic target is sustained: Mine / Well coverage plus separate Farmland and Woodland restart jobs.
- Shows **Abilities needed** against the enabled roster and copy counts.
- Imports Hideout-style setup parameters for convenience, but **does not depend on Hideout to produce the plan**.
- Runs completely in the browser. No account, API key, backend, or upload is required.

## Solver model

The production optimizer evaluates the current recipe dataset, facility capacity, material balance, worker-hours, resident jobs, modules, recipe-note gates, climate requirements, electric variants, collection storage limits, selected objective and minimum-output constraints.

The real-team pass is deliberately separate from the generic production pass. The first answers “what is theoretically best with N generic station slots?” The second answers “what can these exact Aniimo copies actually run?” and may rebalance the recipes around the concrete roster.

The anti-stall layer is an operational heuristic rather than a claim about Aniimo's hidden dispatcher. Its purpose is to prefer spare ability coverage for synchronized basic-material facilities once the economic target is already sustained.

## Running locally

The project is static. Open `index.html` directly in a modern browser, or serve the folder if your browser is strict about ES modules:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765`.

## GitHub Pages

Everything needed for Pages lives visibly in the repository root. The included workflow verifies the JavaScript and optimizer tests, stages the static site, and deploys it from `main`.

## Current boundaries

“One recipe per facility” is currently a facility-type restriction rather than a full integer assignment solver for individual copies of the same building. Climate optimization models the economic cost and recipe access of utility buildings, but does not yet solve physical Homeland-map coverage geometry for their influence radius.

Those are explicit boundaries rather than guessed mechanics.

## Data / attribution

This is an unofficial community tool. Aniimo names, game data and game imagery belong to their respective owners. The implementation and additional optimization layers in this repository are independent community work. Facility and character images are currently referenced from public web asset paths and gracefully degrade if unavailable.
