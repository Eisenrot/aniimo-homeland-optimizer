# Aniimo Homeland Optimizer

> Aniimo Homeland, minus the guesswork. Real staffing, personality-aware optimization, anti-stall planning, and production math that actually respects the workers doing the job.

A standalone, client-side Homeland optimizer for **Aniimo**. It rebuilds the production solver as a normal web app, then adds the layer generic optimizers tend to politely ignore: the concrete Aniimo actually doing the work.

## What it does

- Solves the best Home Coin production chain across your facilities, levels, modules, speed percentages and worker cap.
- Keeps Hideout-style share parameters (`f`, `m`, `y`, `a`, `h`, `w`, `p`) so existing setup links can be imported directly.
- Lets ownership include **copy counts**, stored locally and encoded in this site's optional `c` share parameter.
- Re-solves the chosen plan against a **real team**, with one hour of labor per stationed Aniimo, actual ability levels, and family-gated jobs such as Dewy / Susuta facilities.
- Finds an **ideal-personality ceiling** using the legal E/I · N/S · F/T · J/P personality pairs and the +20% matching-building work bonus.
- Adds a second, deliberately subordinate objective for **anti-stall basic-material coverage** after Home Coin is already maximized: Mine and Well lanes plus separate Farmland/Woodland restart jobs.
- Runs completely in the browser. No account, API key, backend, or upload is required.

## Accuracy target

The clean-room production model was validated against the captured September 2026 Homeland optimizer dataset. With the reference setup used during development it reproduces the displayed **34,940 Home Coin/h** result as **34,939.86/h** before display rounding, including the same recipe mix and fractional facility usage.

The real-team and anti-stall layers are intentionally separate concepts:

- **Economic optimum** answers whether the total labor-hours fit over time.
- **Operational / anti-stall coverage** is a scheduling heuristic for synchronized facilities finishing together. It is not a claim that Animo internally reserves workers in exactly those lanes.

## Running locally

The project is static. Open `index.html` directly in a modern browser, or serve the folder if your browser is strict about ES modules:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765`.

## GitHub Pages

Everything needed for Pages lives in the repository root. The included workflow deploys the static site from `main`; select **GitHub Actions** as the Pages source in repository settings if GitHub has not already enabled it.

## Current boundaries

The initial standalone release focuses on the normal worker-powered Homeland economy used by the reference setup. Electric/generator mode is intentionally not enabled yet rather than pretending an incomplete model is exact. Climate recipes are supported with the observed temperature-distance penalties, but deserve more live-game validation as new content lands. Variant/Nova worker abilities are present in the captured data but the ownership UI currently selects the base species record; explicit form selection is on the roadmap.

## Data / attribution

This is an unofficial community tool. Animo names, game data and game imagery belong to their respective owners. The implementation and additional optimization layers in this repository are independent community work. Facility / character images are currently referenced from public web asset paths and gracefully degrade if unavailable.
