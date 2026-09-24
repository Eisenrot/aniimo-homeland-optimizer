# Aniimo Homeland Optimizer

<p align="center">
  <strong><a href="https://eisenrot.github.io/aniimo-homeland-optimizer/">Open the optimizer</a></strong>
</p>

Homeland is simple until you actually try to optimize it.

Then you're balancing facilities, recipe chains, climate, Recipe Notes, worker abilities, personalities, storage, and whether the "best" plan can even be run by the Aniimo you own.

So I made the calculator do the annoying part.

**It works. Who cares how.**

## What it does

Give it your actual Homeland setup and it can work out:

- what to produce for the best Home Coin return
- how to maximise a specific material instead
- minimum output requirements and multiple **MAX** objectives
- full input / output chains instead of pretending intermediate materials appear from nowhere
- facility counts, levels, modules and Recipe Notes
- climate requirements and utility buildings
- one-recipe-per-facility setups for people who would rather not babysit production every five minutes
- collection limits and worker capacity
- whether the plan is actually possible with your real Aniimo roster

If an objective cannot be reached, the optimizer also tries to explain why instead of just quietly giving you zero and expecting you to divine the problem yourself.

## Real team

The first optimization pass answers the theoretical question:

> What is the best plan if the required workers exist?

The **Real Team** pass answers the useful one:

> Can the Aniimo I actually own run this?

It uses your enabled Aniimo, copy counts and real Homeland ability levels, then checks the plan against the actual jobs that need covering.

It also handles:

- resident-family restrictions
- dedicated utility jobs
- personality recommendations for the jobs being assigned
- measured efficiency overrides
- permanent and burst staffing coverage
- spare basic-material coverage to make production less likely to stall itself into stupidity

The theoretical and real-team Aniimo limits are separate, so you can test ideal plans without pretending your roster is larger than it is.

## Objectives

The main target can be Home Coin or any producible item.

You can also add extra requirements as:

- a hard minimum in items/hour
- a **MAX** co-objective
- multiple MAX targets that the solver tries to keep alive together

Recipe Note items are treated like actual gated recipes. If the note is disabled, the recipe is disabled. If a chain is blocked by a facility level, climate requirement, missing structure or another dependency, the objective diagnostics should point at the blocker.

Yes, Potato Kvass was involved in making sure this behaved properly. Naturally.

## Full Homeland layout

The optimizer can also turn the production plan into a physical Homeland layout instead of stopping at "place 20 Farmlands somewhere, good luck."

The layout pass understands:

- the RV plot grid
- structure footprints
- optional rotation
- compact / automatic packing
- disabled plots
- multiple Storage Units and their placement
- climate utility influence areas
- separate and overlapping climate zones
- the actual number of physical structures needed by the production plan

The automatic layout tries different packing approaches and keeps the one that fits the plan best.

It is still a planning model, not a secret copy of Aniimo's placement code. If the game has some obscure collision quirk nobody has documented yet, the optimizer cannot read the developers' minds. Tragic.

## Roster

The roster is part of the optimizer, not just a checklist.

You can search and filter by Aniimo name, Homeland ability and ability level, for example:

```text
Light
4
Light, >=2
```

The current roster and form data have been reconciled against AniIDEX, including alternate forms where they are relevant to Homeland. Combat-only forms are kept out of the staffing pool when they should not be usable there.

AniIDEX-style portraits are used throughout the roster and staffing views.

## A few details worth knowing

**Utility buildings are optional permissions.** Enabling Cooling Unit, Heat Furnace, Sunlamp or Crackle Generator means the optimizer is allowed to use them. Their cost is only applied when the chosen plan actually needs them.

**One recipe per facility is literal.** Each physical copy stays on one recipe. If you own several copies of the same structure, different copies can still run different recipes.

**Anti-stall coverage is a practical heuristic.** It is there to keep useful spare workers available for basic-material recovery after the main plan is covered. It is not presented as a reconstruction of Aniimo's hidden dispatcher.

**Your setup is client-side.** The site is static and the optimizer runs in the browser.

## Running locally

You can open `index.html` directly in a modern browser.

If your browser decides ES modules are a matter of national security, serve the folder instead:

```bash
python -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

## Project layout

```text
index.html              page shell
styles.css              main interface styling
super.css               small visual overrides

src/app.js              UI, state, rendering and interaction
src/optimizer.js        production + real-team solver
src/climate.js          climate rules and climate-layout checks
src/full-layout.js      full Homeland packing / placement engine
src/progression.js      RV and progression helpers
src/data.js             game-data assembly
src/data/               recipes, facilities, Aniimo and related data

test*.mjs               regression tests
.github/workflows/      verification + GitHub Pages deployment
```

The live version is deployed from `main` through GitHub Pages.

## Data & attribution

This is an unofficial community tool for **Aniimo**.

Aniimo names, game data and game imagery belong to their respective owners. AniIDEX is used as a reference for roster / form data and portrait assets.

The optimizer, staffing model, layout engine, UI and additional planning logic in this repository are independent community work.
