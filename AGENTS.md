# civil-server Agent Notes

## Dependency Sections in package.json

### optionalDependencies
Tools listed here are intentionally optional. They are **not installed** during a Heroku production build because Heroku has strict time and memory limits on the build/slug compilation step. Only what is needed to run the server in production should be installed there.

Examples of what belongs here: `jest`, `cypress`, `enzyme`, `concurrently`, `nodemon`, `webpack-dev-server`, `prettier`.

**Do not move packages out of `optionalDependencies` to fix a "command not found" error in a development environment.** Instead, install the missing package manually in the local environment (e.g., `npm install <pkg> --save-optional`) or check why the optional install failed.

### devDependencies
Build-time tools that ARE needed during the Heroku build (transpilation, bundling). Examples: `@babel/*`, `webpack`, `webpack-cli`.

### dependencies
Packages required at runtime in production.

## Dev Practice: Back Out Failed Fixes

When a change does not fix the problem, remove it before moving on. Leaving ineffective changes in the codebase causes confusion later — it is unclear whether the change was intentional, whether it is doing anything, or whether it is safe to remove.

**Rule:** If a code or config change was made as an attempted fix and it did not solve the problem, revert it as part of landing the correct fix.

Example from Phase 2: `--dns-result-order=ipv4first` was added to `package.json` and `nodemon.json` as an attempted fix for the MongoDB SRV DNS issue on Node 20. It did not work (that flag only affects `dns.lookup()`, not `dns.resolveSrv()`). The correct fix was in `app/start.js`. Both the flag and `nodemon.json` were removed before committing.
