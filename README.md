<p align="center">
  <strong><a href="https://eisenrot.github.io/aniimo-homeland-optimizer/">Open the optimizer</a></strong>
  &nbsp;·&nbsp;
  <a href="#whats-inside">What's inside</a>
  &nbsp;·&nbsp;
  <a href="#how-it-works">How it works</a>
  &nbsp;·&nbsp;
  <a href="#running-locally">Run locally</a>
</p>

<p align="center">
  Aniimo Homeland, minus the guesswork.<br>
  Production planning, real-team staffing, personality-aware optimization, objective chaining and anti-stall coverage in one client-side tool.
</p>

---

## What's inside

<table>
<tr>
<td width="50%" valign="top">

### Production solver

Finds the strongest legal production plan across your actual Homeland setup.

- facility counts and levels
- modules and Recipe Notes
- material balances and dependencies
- climate / utility buildings
- collection storage limits
- one-recipe walk-away mode
- Home Coin or material objectives

</td>
<td width="50%" valign="top">

### Real-team optimizer

Takes the theoretical plan and asks the more useful question: **can the Aniimo you actually own run it?**

- enabled species and copy counts
- real ability levels
- resident-family restrictions
- utility jobs
- personality recommendations
- measured efficiency overrides
- anti-stall basic-material coverage

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Objective-aware planning

The solver can do more than chase Coin.

- maximise any producible item
- require hard minimums in items/hour
- turn requirements into **MAX** co-objectives
- balance multiple reachable MAX targets
- trace missing objectives back through their production chain
- explain recipe, climate, module, level or roster blockers

</td>
<td width="50%" valign="top">

### Roster intelligence

The ownership panel is part of the planning model, not decorative bookkeeping.

- search by Aniimo name
- filter by ability, e.g. `Light`
- filter by level, e.g. `4`
- combine them, e.g. `Light, >=2`
- keep separate **Theoretical plan Aniimo** and **Real team Aniimo** caps

</td>
</tr>
</table>

## How it works

<table>
<tr>
<td align="center" width="25%"><strong>01</strong><br><sub>Describe your Homeland</sub></td>
<td align="center" width="25%"><strong>02</strong><br><sub>Choose an objective</sub></td>
<td align="center" width="25%"><strong>03</strong><br><sub>Inspect the production plan</sub></td>
<td align="center" width="25%"><strong>04</strong><br><sub>Run the real-team pass</sub></td>
</tr>
<tr>
<td valign="top">Set RV level, structures, upgrades, Recipe Notes and optional utility buildings.</td>
<td valign="top">Maximise Home Coin or a material, then add minimums or co-MAX requirements.</td>
<td valign="top">The solver builds complete material chains, groups structure assignments, and shows utility / labour costs.</td>
<td valign="top">Your actual roster is tested against the plan and can rebalance it around abilities and personalities.</td>
</tr>
</table>

## The solver understands

The production pass models the current recipe dataset, facility capacity, level requirements, material balance, worker-hours, resident jobs, modules, Recipe Notes, climate requirements, electric variants, collection limits, optional utility buildings, the selected objective, and minimum-output constraints.

**Utility buildings are permissions, not commitments.** Enabling Cooling Unit, Heat Furnace, Sunlamp or Crackle Generator means the solver may place it if the winning plan benefits from it. The station cost is only paid when that utility is actually selected.

**One recipe per facility** is a real walk-away constraint: each physical structure copy stays on one recipe, while multiple copies of the same structure can be assigned to different recipes.

The real-team pass is deliberately separate. The first pass answers *“what is theoretically best with N generic station slots?”* The second asks *“what can these exact Aniimo copies actually sustain?”* and may rebalance production around the concrete roster.

## A little less babysitting

The tool is designed around the annoying parts that ordinary calculators tend to hand back to you:

- chained inputs that must stay balanced
- objectives that quietly disappear from a mathematically “better” plan
- climate-gated recipes
- resident-only production
- the difference between generic worker capacity and your real roster
- personality bonuses that matter only on the jobs actually being assigned
- spare coverage for restarting basic-material production after a stall

The anti-stall layer is an operational heuristic rather than a claim about Aniimo's hidden dispatcher. Its purpose is to prefer useful spare coverage after the main economic target is already sustained.

## Running locally

This is a static site. Open `index.html` directly in a modern browser, or serve the folder if your browser is strict about ES modules:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765`.

<details>
<summary><strong>Project layout</strong></summary>

```text
index.html              page shell
styles.css              main interface styling
super.css               small visual overrides
src/app.js              UI, state, rendering and interaction
src/optimizer.js        production + staffing solver
src/progression.js      RV / progression helpers
src/data.js             game-data assembly
src/data/                recipes, facilities, items and related data
test*.mjs               optimizer regression tests
.github/workflows/      verification + GitHub Pages deployment
```

</details>

## GitHub Pages

The live version is deployed from `main`:

**https://eisenrot.github.io/aniimo-homeland-optimizer/**

The Pages workflow verifies the JavaScript and optimizer regression tests before staging the static site.

## Current boundaries

The optimizer models production and staffing, but it does **not** solve physical Homeland-map geometry such as the exact influence radius / placement coverage of utility structures.

Real-team recommendations are constrained by the roster and game data available to the project; they are not a reconstruction of any hidden in-game scheduling algorithm.

## Data & attribution

This is an unofficial community tool for **Aniimo**. Aniimo names, game data and game imagery belong to their respective owners.

The optimizer, staffing model, UI and additional planning logic in this repository are independent community work. Public web asset paths are used for some game imagery and gracefully degrade if unavailable.
