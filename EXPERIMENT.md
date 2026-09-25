# Experimental React / TypeScript migration

Branch: `experiment/react-ts-vite`

This branch is intentionally isolated from `main`.

## Migration rule

The first milestone does **not** rewrite optimization mathematics.

The modern shell imports the current `GAME_DATA`, `DEFAULT_STATE`, and `optimizePlan()` implementation and executes the existing solver in a Vite Web Worker. This gives the migration a golden behavioral reference before the compute engine changes.

The original interface is preserved at `/legacy.html` on this branch.

Both interfaces use the existing local-storage key:

```
aniimoHomelandOptimizerStateV1
```

so the same Homeland state can be compared between them.

## Current architecture

```
React + TypeScript UI
        |
        v
OptimizerClient
        |
        v
Vite module Worker
        |
        v
existing optimizePlan()
        |
        +-- current custom simplex LP
        +-- current climate geometry
        +-- current recipe-selection search
```

## Next compute milestones

1. Add a parity benchmark that runs representative saved states through the legacy engine and records objective, row, scenario and timing differences.
2. Introduce a solver interface beneath `optimizePlan`.
3. Implement a HiGHS 1.15.3 WebAssembly LP backend in a Worker.
4. Benchmark custom simplex vs HiGHS on the real Homeland models before changing defaults.
5. Split independent climate scenarios across a persistent worker pool.
6. Replace quarter-step rectangle collision scanning with integer-grid / bitset placement.
7. Port the remaining UI slices: guarantees/MAX objectives, modules, Recipe Notes, ownership, Real Team, personality analysis and full physical layout.
8. Only after parity is stable, delete the legacy shell.

## Why Vite rather than Next.js

The optimizer is a local compute application. SSR, Server Components and route handlers do not make its LP or geometry work faster. Vite keeps Web Workers, WASM and GitHub Pages deployment simple while React/TypeScript give the UI and state model proper structure.

## HiGHS

`highs@1.15.3` is included now so the solver migration can happen behind the engine boundary without another application rewrite. The first milestone deliberately does not use it for production results yet.

## First LP backend benchmark

GitHub Actions Ubuntu runner, full `optimizePlan()` path, identical state/data, only LP backend swapped:

| Scenario | JS simplex | HiGHS WASM | HiGHS / JS |
| --- | ---: | ---: | ---: |
| default coin | 14.1 ms | 56.6 ms | 4.02x |
| all climate options | 86.5 ms | 65.3 ms | 0.75x |
| material target | 1.7 ms | 3.3 ms | 1.92x |
| joint MAX | 7.1 ms | 14.3 ms | 2.02x |

All four scenarios passed numerical parity.

The result argues against blindly replacing the custom simplex. The next compute experiment should be hybrid:

- retain the JS simplex for small cheap LPs;
- investigate persistent HiGHS models / warm starts for repeated related solves;
- test HiGHS where climate branching makes the LP workload large enough to amortize Wasm/model setup;
- investigate a HiGHS MIP formulation for one-recipe-per-facility rather than repeatedly enumerating recipe subsets;
- parallelise independent scenario work with a persistent Worker pool.

The benchmark remains available as:

```bash
npm run benchmark:lp
```
