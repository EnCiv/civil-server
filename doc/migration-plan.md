# civil-server Dependency Migration Plan

**Date:** April 2026  
**Current Node:** 16.16.0  
**Goal:** Migrate all packages to their latest stable versions with minimal disruption to consuming projects.

---

## Context and Constraints

- **civil-server** is a published npm package used by other projects as a server foundation. Its public API surface (exported from `app/index.js`) must remain stable unless the consuming projects are updated in lockstep.
- **civil-client** is a peer and integral dependency. Changes to React, JSX transforms, and testing infrastructure must be coordinated between both repos.
- **Existing test coverage is sparse.** Where migration changes code behavior, new focused tests are called out explicitly in each phase.
- Breaking changes to the following exported symbols require consuming-project coordination: `theCivilServer`, `serverEvents`, `Iota`, `User`, `serverReactRender`, `SibSendTransacEmail`, `SibGetTemplateId`, `SibDeleteSmtpTemplate`.

---

## Package Inventory and Version Targets

| Package                    | Current               | Target                      | Risk     | Notes                                                                       |
| -------------------------- | --------------------- | --------------------------- | -------- | --------------------------------------------------------------------------- |
| **Node.js**                | 16.16.0               | 20 LTS                      | Low      | 16 is EOL; 20 is LTS                                                        |
| `react` / `react-dom`      | ^16.14.0              | ^19.x                       | **HIGH** | Must coordinate with civil-client                                           |
| `react-hot-loader`         | ^4.13.0               | **remove**                  | High     | Deprecated; replace with webpack HMR                                        |
| `enzyme` + adapter         | ^3.11.0               | **remove**                  | High     | Dead for React 18+; replace with @testing-library/react                     |
| `react-helmet`             | ^6.1.0                | `react-helmet-async`        | Med      | react-helmet has concurrent-mode bugs                                       |
| `@hapi/joi`                | ^15.1.0               | `joi` ^17.x                 | Med      | Renamed + major version; API changes in validate()                          |
| `express`                  | ^4.17.1               | ^5.x                        | Med      | Async error propagation now built-in                                        |
| `express-rate-limit`       | ^5.5.1                | ^7.x                        | Low      | `onLimitReached` removed; minor API changes                                 |
| `helmet`                   | ^6.2.0                | ^8.x                        | Low      | Minor CSP defaults changed                                                  |
| `marked`                   | ^4.0.7                | ^12.x                       | Med      | Sync API preserved with `marked.parse()`                                    |
| `superagent`               | ^5.3.1                | remove / replace            | Low      | Unmaintained; replace with native `fetch` (Node 18+)                        |
| `sib-api-v3-sdk`           | ^8.4.2                | `@getbrevo/brevo` ^2.x      | Med      | Company rebranded; SDK restructured                                         |
| `mongodb`                  | ^5.9.2                | ^6.x                        | Med      | Blocked by `@enciv/mongo-collections` peerDep on `^5.0.0`; upgrade together |
| `body-parser`              | ^1.19.1               | remove                      | Low      | Built into Express 4.16+/5                                                  |
| `@babel/plugin-proposal-*` | ^7.16.0               | `@babel/plugin-transform-*` | Low      | Proposals became transforms                                                 |
| `webpack-cli`              | ^4.9.1                | ^5.x                        | Low      | Config syntax stable                                                        |
| `webpack-dev-server`       | ^4.6.0                | ^5.x                        | Low      | Minor config changes                                                        |
| `concurrently`             | ^6.4.0                | ^8.x                        | Low      | Drop-in compatible                                                          |
| `nodemon`                  | ^2.0.15               | ^3.x                        | Low      | Drop-in compatible                                                          |
| `prettier`                 | ^2.5.1                | ^3.x                        | Low      | Config format changes                                                       |
| `cypress`                  | ^9.1.1                | ^13.x                       | Low      | Some selector/config changes                                                |
| `@storybook/*`             | ^6.4.9 (civil-client) | ^8.x                        | Med      | civil-client only; major config overhaul                                    |
| `log4js` (fork)            | git fork              | assess                      | Med      | Evaluate if upstream supports browser or replace                            |

---

## Migration Phases

---

### Phase 1 — Node.js Upgrade: 16 → 20 LTS

**Why first:** Node 16 is end-of-life. All subsequent package updates are tested against a supported runtime.

**Steps:**

1. Update `.nvmrc` / `engines` field in `package.json` to `"node": ">=20.0.0"`.
2. Update CI/CD pipelines and Heroku/Render runtime config to Node 20.
3. Run the full existing test suite without changing any application code.

**Verify:** `node --version`, then `npm test`.

**Tests to add:**

- None required; this phase is infrastructure-only. If tests fail here, fix the root cause before proceeding.

**Impact on consuming projects:** Inform them they also need Node 20+.

---

### Phase 2 — Low-Risk Server Dependency Updates (same major or stable minor)

Update the following in one PR. All are drop-in compatible within their current major:

```
concurrently         ^6 → ^8
nodemon              ^2 → ^3
express-rate-limit   ^5 → ^7
helmet               ^6 → ^8
webpack-cli          ^4 → ^5
webpack-dev-server   ^4 → ^5
prettier             ^2 → ^3  (+ pretty-quick ^3 → ^4)
cypress              ^9 → ^13
supertest            (new — added for rate-limit testing)
```

> **mongodb skipped:** `@enciv/mongo-collections@0.0.3` declares `peerDependencies: { "mongodb": "^5.0.0" }`. Upgrading mongodb to v6 violates this constraint. The mongodb upgrade must be coordinated with a `@enciv/mongo-collections` update and is deferred to a dedicated phase after Phase 3.

**Specific notes:**

- **`express-rate-limit` v7:** The `onLimitReached` callback was removed (not used here). The `max` option renamed to `limit` — update `routes/sign-in.js`. The `message` string option still works. The `req.rateLimit` info object is now at `res.locals.rateLimit`.
- **`helmet` v8:** The default `crossOriginEmbedderPolicy` is now `require-corp`. The existing code only uses `helmet.hidePoweredBy()` and `helmet.contentSecurityPolicy()` individually (not `helmet()` globally), so this default change has no effect.
- **`webpack-dev-server` v5:** The `proxy` config must be an array. Convert `proxy: { context: () => true, '/': 'http://...' }` to `proxy: [{ context: () => true, target: 'http://...' }]` in `webpack-dev.config.js`.
- **`prettier` v3:** The `jsxBracketSameLine` option was removed; rename to `bracketSameLine` in `.prettierrc`.
- **`useUnifiedTopology`:** The option is removed in mongodb v6 (already a no-op in v5). Remove from `earlyStart()` in `the-civil-server.js` now so it's ready for the future mongodb upgrade.

**Verify:** `npm test`, then manually start the dev server and verify the browser loads.

**Tests to add:**

_Rate limiting (new file: `app/routes/__tests__/sign-in-rate-limit.js`):_

```js
// Test that the rate limiter rejects requests after N attempts
// Use supertest against the express app mounted with the rate-limit middleware
// Verify: after limit is exceeded, response is 429
// Verify: the handler option (not onLimitReached) is invoked
```

---

### Phase 3 — `@hapi/joi` → `joi` v17

**Why separate:** This affects the `User` model's schema validation, which is a core data-integrity mechanism used by `User.create()` in every auth flow. Consuming projects that import `User` are indirectly affected if validation error shapes change.

**Current code** (`app/models/user.js`):

```js
const Joi = require('@hapi/joi')
const schema = Joi.object({ ... email: Joi.string().email(), ... })
```

**Changes:**

1. `npm uninstall @hapi/joi && npm install joi`
2. Change the require to `const Joi = require('joi')`.
3. **Breaking change:** In joi v17, `string().email()` by default uses TLD validation. If any test emails like `user@email` (no TLD) were allowed before, they will now fail. Verify test data uses valid TLDs.
4. **Breaking change:** `schema.validate(doc)` error object structure is the same, but the error messages changed. If any code inspects `error.message` text, update those assertions.
5. **Breaking change:** `Joi.validate()` function (old API) no longer exists in v17; the code already uses `schema.validate(doc)` which is the correct v17 style.

**Verify:** `npm test` — all User model tests must pass.

**Tests to add** (`app/models/__tests__/user.js` — add describe block):

```js
describe('User schema validation', () => {
  test('rejects document with invalid email format', async () => { ... })
  test('rejects document with missing required fields per schema', async () => { ... })
  test('accepts valid user document', async () => { ... })
  test('validate() returns error object (not throws) on invalid input', async () => { ... })
})
```

---

### Phase 4 — `cloudinary` ~~v1 → v2~~ (removed)

Audit found no code in this repo imports or uses the `cloudinary` package. References to Cloudinary URLs in the codebase are plain strings that require no SDK. The package has been removed from `dependencies` in `package.json`.

---

### Phase 5 — `marked` v4 → v12

**Why separate:** `marked` is used for Markdown rendering in `doc-mddoc.js`. The API shifted significantly between major versions.

**Changes:**

1. `npm install marked@^12`
2. Rewrote `app/routes/doc-mddoc.js`: added missing `fs` and `path` imports; fixed path-traversal vulnerability (now restricts to `assets/md/` and validates filename); uses `marked.parse(text)` to render HTML (was returning raw `text/markdown`).
3. Created `assets/md/civil-server.md` as a test document browseable at `/doc/civil-server`.
4. In v12, `marked(text)` still works but `marked.parse(text)` is the canonical API — used throughout.

**Verify:** `npm test`; browse to `/doc/civil-server` in the dev server and confirm HTML renders.

**Tests added** (`app/routes/__tests__/doc-mddoc.js`):

- 200 + `text/html` content-type for existing document
- Rendered HTML contains `<h1>` and `<table>` elements
- 404 for non-existent document
- 400 for path-traversal attempts in document name

---

### Phase 6 — `sib-api-v3-sdk` → `@getbrevo/brevo`

**Why separate:** SendinBlue rebranded to Brevo. The v3 SDK package is unmaintained. The new SDK (`@getbrevo/brevo`) has restructured initialization and response shapes.

**Changes made:**

1. `npm uninstall sib-api-v3-sdk && npm install @getbrevo/brevo@^2`
2. `app/lib/send-in-blue-transactional.js`: `require('@getbrevo/brevo')` replacing `sib-api-v3-sdk`.
3. **Breaking — init pattern:** `ApiClient` singleton is gone in v2. Auth is set per-instance, and the auth key name changed:
   ```js
   // Before
   SibApiV3Sdk.ApiClient.instance.authentications['api-key'].apiKey = process.env.SENDINBLUE_API_KEY
   SibSMTPApi = new SibApiV3Sdk.TransactionalEmailsApi()
   // After
   SibSMTPApi = new Brevo.TransactionalEmailsApi()
   SibSMTPApi.authentications['apiKey'].apiKey = process.env.SENDINBLUE_API_KEY
   ```
4. **Breaking — response shape:** All SDK methods now return `{ response, body }` instead of the body directly. Unwrapped `body` at all three call sites: `createSmtpTemplate`, `getSmtpTemplates`, `sendTransacEmail`.
5. The environment variable `SENDINBLUE_API_KEY` is unchanged.
6. **New: `app/lib/brevo-transactional.js`** — re-exports the same three functions under preferred `Brevo*` names:
   - `BrevoSendTransacEmail`, `BrevoGetTemplateId`, `BrevoDeleteSmtpTemplate`
     The `Sib*` names are kept for backwards compatibility and are deprecated. Consuming projects should migrate to the `Brevo*` names.
7. **Dual env var support:** Both `BREVO_API_KEY` / `BREVO_DEFAULT_FROM_EMAIL` (preferred) and the legacy `SENDINBLUE_API_KEY` / `SENDINBLUE_DEFAULT_FROM_EMAIL` are accepted. `BREVO_*` takes precedence if both are set. The resolved values are exported as `brevoApiKey` and `brevoDefaultFromEmail` so consuming code (e.g. `send-password.js`) uses the same resolved value rather than reading env vars directly.
8. **`app/lib/brevo-transactional.js`** also re-exports `brevoApiKey` and `brevoDefaultFromEmail`.
9. **`app/index.js`** exports `brevoApiKey` and `brevoDefaultFromEmail` alongside the function aliases.
10. **`app/socket-apis/send-password.js`** updated to import and use `brevoDefaultFromEmail` instead of `process.env.SENDINBLUE_DEFAULT_FROM_EMAIL` directly.

**Verify:** `npm test`; run with `SENDINBLUE_API_KEY` set to exercise the live API suite.

**Tests:**

- `app/lib/__tests__/send-in-blue-transactional.js`: fixed `'Template can be created'` assertion — Brevo v2 does not guarantee monotonically increasing IDs after delete/recreate; now asserts `> 0`.
- `app/lib/__tests__/brevo-transactional.js` (new): verifies each `Brevo*` export is the exact same function reference as its `Sib*` counterpart. Uses no live API calls, avoiding parallel-test interference with the `send-in-blue-transactional` suite.

---

### Phase 7 — Babel Plugin Renames

**Why separate:** The `@babel/plugin-proposal-*` packages are deprecated and the equivalent transforms now ship as `@babel/plugin-transform-*`. Many are also now included in `@babel/preset-env` for modern targets, so explicit plugin entries may not be needed at all.

**Changes in `package.json` `devDependencies`:**

```
@babel/plugin-proposal-class-properties    → @babel/plugin-transform-class-properties
@babel/plugin-proposal-object-rest-spread  → @babel/plugin-transform-object-rest-spread
```

**Changes in `.babelrc` / `babel.config.js` (if present):**

```json
// before
"plugins": ["@babel/plugin-proposal-class-properties", ...]
// after
"plugins": ["@babel/plugin-transform-class-properties", ...]
```

Also evaluate:

- `@babel/plugin-transform-react-inline-elements` — verify still needed with React 18 automatic JSX transform
- `@babel/plugin-transform-regenerator` — may be handled by `@babel/preset-env` with `useBuiltIns: 'usage'`

**Verify:** `npm run transpile` produces output; `npm run packbuild` completes without errors.

**Tests to add:** None specific — existing transpilation output is tested implicitly by other phases.

---

### Phase 8 — `superagent` removal (unused)

**Audit result:** `superagent` was listed in `dependencies` in `package.json` but is not imported anywhere in `app/`. No call sites exist in civil-server. The package has been removed.

**civil-client usage:** civil-client may use superagent for browser-side API calls; that is a separate concern scoped to the civil-client repo and does not affect civil-server.

**Changes:**

1. `npm uninstall superagent` — removed from `dependencies` and `node_modules`.
2. No application code changes required.

---

### Phase 9 — React 16 → React 19 _(Coordinate with civil-client)_ ✅ DONE

**Completed May 2026. Both repos updated to React 19.2.6.**

#### Sub-phase 9a — Remove `react-hot-loader` ✅

- `app/components/app.jsx`: Removed `import { hot } from 'react-hot-loader'` and `hot(module)(App)` wrapper. `App` exported directly.
- `webpack-dev.config.js`: Removed `'webpack/hot/only-dev-server'` entry; webpack 5 built-in HMR is sufficient.
- civil-client: `clientMain` updated to use `ReactDOM.createRoot()`.

#### Sub-phase 9b — Upgrade React packages ✅

```
npm install react@^19 react-dom@^19   # in both repos
```

**Breaking changes addressed:**

1. **`ReactDOM.render()` removed** — civil-client's `clientMain` updated to `ReactDOM.createRoot().render()`.

2. **`react-helmet` → `react-helmet-async` v3** — Replaced in both `app.jsx` and `server-react-render.jsx`. **Important React 19 caveat:** `react-helmet-async` v3 with React 19 does **not** populate `helmetContext.helmet` during SSR — React 19 handles `<title>`, `<meta>`, and `<link>` hoisting natively. The `server-react-render.jsx` HTML template was rewritten to use static head tags; all `helmet.xxx.toString()` calls were removed. `<HelmetProvider>` still wraps the render tree (no `context` prop needed).

3. **JSS class name hydration mismatch** — `react-jss` generates class names with an instance ID (e.g. `authFormWrapper-0-2-1` server vs `authFormWrapper-1-2-1` client). Fixed by:
   - A custom `createStableGenerateId` in `server-react-render.jsx` that omits the instance counter.
   - Wrapping the client render tree in `<JssProvider generateId={...}>` with a matching module-level counter in `app/client/main-app.js`.
   - On Windows dev systems, junctioning civil-client's `react-jss` → civil-server's copy so both share one module instance (see Windows dev setup below).

4. **`serverReactRender.bind(this.App)` bug** — In `the-civil-server.js`, the `notFound()` and `error()` methods were incorrectly binding `this.App` as the `this` context. Fixed to `serverReactRender.bind(null, this.App)` so `App` arrives as the first positional argument.

5. **`optimization.nodeEnv: false`** — Added to `webpack-dev.config.js` to prevent webpack from replacing `process.env.NODE_ENV` with a static string at bundle time, which was compiling the runtime check in `main.js` to `if (false) {}`.

6. **`react-jss`** — v10.9.0 confirmed compatible with React 19.

#### Sub-phase 9c — Replace Enzyme with @testing-library/react ✅

1. Removed `enzyme`, `enzyme-adapter-react-16`, `jest-enzyme`.
2. Added `@testing-library/react`, `@testing-library/jest-dom`, and `@testing-library/dom` (peer dep) to `optionalDependencies`.
3. Updated `jest-test-setup.js`: removed Enzyme configure; imports `@testing-library/jest-dom`.
4. Updated `jest.config.js`: removed `jest-enzyme` from `setupFilesAfterEnv`.

**Tests added:**

- `app/components/__tests__/app.test.js` — renders App with `@testing-library/react`; verifies basic render and HelmetProvider wrapping.

#### Windows dev setup — npm-link civil-client ✅

On Windows, standard `npm link` uses symlinks that Node.js does not follow correctly. A script `link-civil-client.js` (run via `npm run link-civil-client`) creates four Windows junction points:

- `civil-server-update/node_modules/civil-client` → `civil-client/`
- `civil-client/node_modules/react` → `civil-server-update/node_modules/react`
- `civil-client/node_modules/react-dom` → `civil-server-update/node_modules/react-dom`
- `civil-client/node_modules/react-jss` → `civil-server-update/node_modules/react-jss`

The last three junctions ensure a single module instance for each package, preventing "invalid hook call" errors and JSS class name mismatches.

**Verify:** `npm test` passes; `/join` SSR renders with no hydration warnings; `npm run link-civil-client` creates all four junctions cleanly.

---

### Phase 10 — `express` v4 → v5 _(Optional — Evaluate after Phase 9)_

Express 5 became stable in 2024. The main benefit for this codebase is native async error propagation — the `try/catch` wrappers in routes like `sign-in.js` and `sign-up.js` become unnecessary.

**Breaking changes to address:**

1. **`req.query` values are always strings** (already true in v4 with default parser).
2. **`res.locals.error`** — No change.
3. **Route path syntax** — RegExp routes changed. Review any regex-based routes.
4. **`next(err)` in async routes** — In Express 5, if an async route function throws, Express automatically calls `next(err)`. The existing try/catch wrappers still work but are now optional.
5. **`body-parser`** — Can be removed; use `express.json()` and `express.urlencoded()` directly. The `the-civil-server.js` already imports `bodyParser`; switch to:
   ```js
   this.app.use(express.urlencoded({ extended: true }), express.json(), express.text())
   ```

**Tests to add** (`app/routes/__tests__/sign-up.js` — new file):

```js
// Using supertest, mount sign-up route on an express 5 app
// Verify: missing email → 400
// Verify: missing password → 400
// Verify: duplicate email → 401
// Verify: successful signup → sets cookie and returns user ID
```

---

### Phase 11 — `log4js` Custom Fork Assessment

The `log4js` dependency points to a custom GitHub fork (`ddfridley/log4js-node#onbrowser`) that adds browser support. This is a long-term technical debt item.

**Options:**

1. **Keep the fork and update it** to the latest upstream log4js if the fork is diverged.
2. **Replace with a browser-compatible logger** such as `loglevel`, `pino` (Node) + a browser shim, or a custom thin wrapper around `console` for the browser and a structured logger for Node.
3. **Evaluate if log4js is actually needed in the browser** — browser logs appear to be sent via socket to the server (`browserMongoAppender`). If this feature is important, keep the fork.

**Tests to add** (new file: `app/server/__tests__/logger-setup.js`):

```js
// Verify logger is initialized (global.logger is defined)
// Verify bslogger (browser socket logger) is defined
// Verify a log call does not throw
```

---

### Phase 12 — civil-client: Storybook v6 → v10 ✅ DONE

**Completed May 2026. Storybook upgraded to v10.3.6.**

**Packages updated in civil-client `optionalDependencies`:**

```
storybook                    ^6 → ^10.0.0
@storybook/react-webpack5    ^6 → ^10.0.0
@storybook/addon-links       ^6 → ^10.0.0
```

**Packages removed** (now bundled into the core `storybook` package):

```
@storybook/addon-essentials
@storybook/test
```

**Polyfills added** to `optionalDependencies` for webpack5 browser build:

```
path-browserify       ^1.0.1
constants-browserify  ^1.0.0
process               ^0.11.10
util                  ^0.12.5
```

**`.storybook/main.js` changes:**

- Removed `@storybook/addon-essentials` from addons (it's now included in core).
- Added `webpackFinal` with `resolve.fallback` entries for all Node.js built-in polyfills and a `babel-loader` rule for JSX.

**Story file fixes** (all 4 story files):

- `import { React, useState } from 'react'` → `import React, { useState } from 'react'` — React is a default export, not a named export.

**Auth route mocking:**

- Created `stories/mocks/auth-routes-middleware.js` — exports `authRoutesMiddleware(router)`, which intercepts POST `/sign/in`, `/sign/up`, and `/tempid` with mock responses. Designed to work with both Express-enhanced responses and the raw `http.ServerResponse` that Storybook 10's dev server passes to middleware (i.e. uses `res.statusCode`/`res.setHeader()`/`res.end()` rather than `res.json()`). Body is read via async iteration of the request stream rather than `express.json()` middleware.
- `.storybook/middleware.js` delegates to `authRoutesMiddleware`.
- Mock credentials: email `success@email.com` / password `password` → 200 success response.

**Verify:** `npm run storybook` in civil-client; all 4 story files load without React errors; auth form actions (sign-in, sign-up, skip) return the expected mock responses.

---

## Testing Strategy Summary

The table below maps each phase to tests that should be written **before and after** the migration change to catch regressions.

| Phase | New Test File(s)                                      | Key Assertions                                |
| ----- | ----------------------------------------------------- | --------------------------------------------- |
| 2     | `routes/__tests__/sign-in-rate-limit.js` ✅           | 429 after limit; correct handler option       |
| 3     | `models/__tests__/user.js` (extend)                   | joi v17 email validation; error shapes        |
| 5     | `routes/__tests__/doc-mddoc.js` ✅                    | Markdown HTML output; 404 for missing doc     |
| 6     | `lib/__tests__/send-in-blue-transactional.js` ✅      | Mock Brevo SDK; graceful missing-key handling |
| 6     | `lib/__tests__/brevo-transactional.js` ✅             | Brevo* aliases are same function refs as Sib* |
| 8     | (per superagent call site)                            | fetch mock; correct URL/body/error handling   |
| 9     | `components/__tests__/app.test.js` ✅                 | React 19 render; HelmetProvider wrapping      |
| 9     | `server/routes/__tests__/server-react-render.test.js` | SSR HTML; helmet tags; JSS styles             |
| 10    | `routes/__tests__/sign-up.js`                         | All sign-up branch outcomes via supertest     |
| 11    | `server/__tests__/logger-setup.js`                    | Logger init; no-throw on log calls            |

---

## Coordination Points with Consuming Projects

Before releasing any phase that changes the exported API, publish a pre-release version of civil-server (e.g., `1.1.0-alpha.1`) and test it against at least one consuming project (e.g., civil-pursuit).

**API surface changes by phase:**

| Phase | Change                                                                                             | Consuming Project Impact                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 3     | Joi v17 error messages differ                                                                      | Any project inspecting `User.validate()` error text                                                         |
| 6     | Brevo SDK init; env var name preserved; `Sib*` names kept (deprecated); new `Brevo*` aliases added | Projects using `SibSendTransacEmail` etc. still work; migrate to `Brevo*` names                             |
| 9a    | `App` exported directly (no `hot` wrapper)                                                         | Any project importing `App` from civil-server                                                               |
| 9b    | React 19; `createRoot` in civil-client                                                             | civil-client must be updated in lockstep                                                                    |
| 9b    | `react-helmet` → `react-helmet-async`; needs `<HelmetProvider>`                                    | Projects wrapping the app need HelmetProvider                                                               |
| 10    | `body-parser` removed                                                                              | Consuming projects must use `express.json()` themselves if they depend on body-parser being already mounted |

---

## Suggested Phase Order and Branching Strategy

```
main
 └── phase/1-node20                 ✅ done
 └── phase/2-low-risk-deps          ✅ done
 └── phase/3-joi-v17                ✅ done
 └── phase/4-cloudinary-v2          ✅ done (removed unused package)
 └── phase/5-marked-v12             ✅ done
 └── phase/6-brevo-sdk              ✅ done
 └── phase/7-babel-transform-rename ✅ done
 └── phase/8-superagent-removal     ✅ done
 └── phase/9-react-19               ✅ done (coordinate with civil-client)
 └── phase/10-express-5             ← optional; may skip if cost/benefit is low
 └── phase/11-log4js-assessment
 └── phase/12-storybook-v10         ✅ done (in civil-client repo)
```

Each branch should:

1. Install the new package(s).
2. Write (or update) the tests called out in the phase.
3. Verify the new tests pass.
4. Fix any code broken by the new package.
5. Verify the full test suite still passes.
6. Open a PR with a description of what changed and what was tested.

---

## Quick-Reference: Commands to Check Current Stable Versions

```bash
# Check what's outdated in the current install
npm outdated

# Check latest stable for a specific package
npm view react version
npm view joi version
npm view express version
npm view marked version

# Check for security advisories
npm audit
```

Run `npm audit` before starting any phase and resolve any HIGH/CRITICAL advisories in that phase's scope first.
