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
