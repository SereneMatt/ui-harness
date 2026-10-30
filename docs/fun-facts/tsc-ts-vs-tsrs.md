# tsc-ts vs tsrs

ui-harness moved from [tsc-ts](https://www.npmjs.com/package/tsc-ts) to [tsrs](https://www.npmjs.com/package/tsrs) on 2026-10-30.

- tsc-ts 0.0.4 is the TypeScript 7 compiler ported to TypeScript and compiled to a native executable. It reports TypeScript 7.0.2.
- tsrs 0.20.1-ts7.1.0-beta is a Rust port of the TypeScript 7 compiler. It reports TypeScript 7.1.0-beta.

Both compilers emit byte-identical `dist/` output (6 files) for this repo.

## Benchmark

Each row runs both projects (`tsconfig.json` and `tsconfig.browser.json`) in sequence. Each tool got 1 warm-up run and then 10 timed runs. `dist/` was deleted before every run. Times are wall-clock milliseconds.

| Task | Tool | Average | Median | Min | Max |
| --- | --- | --- | --- | --- | --- |
| Typecheck (`--noEmit`) | tsc-ts 0.0.4 | 371.2495023999999 | 363.0590545 | 347.103682 | 398.902071 |
| Typecheck (`--noEmit`) | tsrs 0.20.1 | 333.775934 | 333.3132515 | 316.915108 | 350.152778 |
| Build (emit) | tsc-ts 0.0.4 | 364.16347170000006 | 362.3409395 | 347.168086 | 381.639793 |
| Build (emit) | tsrs 0.20.1 | 342.82560409999996 | 341.2161155 | 324.086915 | 368.317458 |

On average, tsrs was 37.47356839999992 ms faster for typecheck and 21.337867600000095 ms faster for build.

Machine: Intel Core i7-4870HQ at 2.50 GHz, 8 threads, Linux (Omarchy), Node 26.8.2.
