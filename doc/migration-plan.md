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

| Package | Current | Target | Risk | Notes |
|---------|---------|--------|------|-------|
| **Node.js** | 16.16.0 | 20 LTS | Low | 16 is EOL; 20 is LTS |
| `react` / `react-dom` | ^16.14.0 | ^19.x | **HIGH** | Must coordinate with civil-client |
| `react-hot-loader` | ^4.13.0 | **remove** | High | Deprecated; replace with webpack HMR |
| `enzyme` + adapter | ^3.11.0 | **remove** | High | Dead for React 18+; replace with @testing-library/react |
| `react-helmet` | ^6.1.0 | `react-helmet-async` | Med | react-helmet has concurrent-mode bugs |
| `@hapi/joi` | ^15.1.0 | `joi` ^17.x | Med | Renamed + major version; API changes in validate() |
| `express` | ^4.17.1 | ^5.x | Med | Async error propagation now built-in |
| `express-rate-limit` | ^5.5.1 | ^7.x | Low | `onLimitReached` removed; minor API changes |
| `helmet` | ^6.2.0 | ^8.x | Low | Minor CSP defaults changed |
| `cloudinary` | ^1.27.1 | ^2.x | Med | SDK restructured; init API changed |
| `marked` | ^4.0.7 | ^12.x | Med | Sync API preserved with `marked.parse()` |
| `superagent` | ^5.3.1 | remove / replace | Low | Unmaintained; replace with native `fetch` (Node 18+) |
| `sib-api-v3-sdk` | ^8.4.2 | `@getbrevo/brevo` ^2.x | Med | Company rebranded; SDK restructured |
| `mongodb` | ^5.9.2 | ^6.x | Med | Blocked by `@enciv/mongo-collections` peerDep on `^5.0.0`; upgrade together |
| `body-parser` | ^1.19.1 | remove | Low | Built into Express 4.16+/5 |
| `@babel/plugin-proposal-*` | ^7.16.0 | `@babel/plugin-transform-*` | Low | Proposals became transforms |
| `webpack-cli` | ^4.9.1 | ^5.x | Low | Config syntax stable |
| `webpack-dev-server` | ^4.6.0 | ^5.x | Low | Minor config changes |
| `concurrently` | ^6.4.0 | ^8.x | Low | Drop-in compatible |
| `nodemon` | ^2.0.15 | ^3.x | Low | Drop-in compatible |
| `prettier` | ^2.5.1 | ^3.x | Low | Config format changes |
| `cypress` | ^9.1.1 | ^13.x | Low | Some selector/config changes |
| `@storybook/*` | ^6.4.9 (civil-client) | ^8.x | Med | civil-client only; major config overhaul |
| `log4js` (fork) | git fork | assess | Med | Evaluate if upstream supports browser or replace |

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

*Rate limiting (new file: `app/routes/__tests__/sign-in-rate-limit.js`):*
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

### Phase 4 — `cloudinary` v1 → v2

**Why separate:** Cloudinary is used for media uploads. The v2 SDK has a restructured initialization API. Failure here breaks any image/video upload functionality.

**Changes:**
1. `npm install cloudinary@^2`
2. v2 init: `const { v2: cloudinary } = require('cloudinary')` — the default export no longer has `.v2`. Review any file importing cloudinary and update accordingly.
3. The `cloudinary.config()` call signature is the same.
4. Upload callbacks are now fully promise-based (callback style removed).

**Verify:** Run any cloudinary-related integration tests if they exist; otherwise manually test a media upload in dev.

**Tests to add** (new file: `app/socket-apis/__tests__/cloudinary-upload.js` — only if upload logic lives in socket-apis):
```js
// Mock cloudinary v2 and verify the upload handler:
// - calls cloudinary.uploader.upload with correct params
// - handles successful response
// - handles upload error and calls cb with error string
```

---

### Phase 5 — `marked` v4 → v12

**Why separate:** `marked` is used for Markdown rendering (e.g., `doc-mddoc.js`). The API shifted significantly between major versions.

**Changes:**
1. `npm install marked@^12`
2. In v5+, `marked(text)` is still supported but deprecated; use `marked.parse(text)`.
3. `marked.parse(text)` returns a string synchronously by default (async renderer hooks are opt-in).
4. Lexer/parser hooks changed if any custom renderer is in use.
5. Review `app/routes/doc-mddoc.js` for usage.

**Verify:** Load a markdown-rendered route in the browser and confirm rendering is correct.

**Tests to add** (new file: `app/routes/__tests__/doc-mddoc.js`):
```js
// Test the markdown route handler:
// - Verify that given a markdown document, the response contains expected HTML tags
// - Verify headers (Content-Type: text/html)
// - Verify 404 for missing document path
```

---

### Phase 6 — `sib-api-v3-sdk` → `@getbrevo/brevo`

**Why separate:** SendinBlue rebranded to Brevo. The v3 SDK package is unmaintained. The new SDK (`@getbrevo/brevo`) has restructured initialization and method names.

**Current code** (`app/lib/send-in-blue-transactional.js`):
```js
const SibApiV3Sdk = require('sib-api-v3-sdk')
// ... SibSMTPApi = new SibApiV3Sdk.TransactionalEmailsApi()
```

**Changes:**
1. `npm uninstall sib-api-v3-sdk && npm install @getbrevo/brevo`
2. Update import: `const Brevo = require('@getbrevo/brevo')`
3. Initialization pattern changes:
   ```js
   const apiInstance = new Brevo.TransactionalEmailsApi()
   apiInstance.authentications['api-key'].apiKey = process.env.SENDINBLUE_API_KEY
   ```
4. Method names are largely the same but check:  
   - `createSmtpTemplate` → same  
   - `getSmtpTemplates` → same  
   - `deleteSmtpTemplate` → same  
   - `sendTransacEmail` → same  
5. The environment variable `SENDINBLUE_API_KEY` can remain the same name (the value works with Brevo's API).
6. Update the exported API surface; the functions `SibGetTemplateId`, `SibSendTransacEmail`, `SibDeleteSmtpTemplate` keep the same names to avoid breaking consuming projects.

**Verify:** The existing `app/lib/__tests__/send-in-blue-transactional.js` test (skipped without API key) should be runnable with a real key.

**Tests to add** (extend `app/lib/__tests__/send-in-blue-transactional.js`):
```js
// Add a unit test (no real API key needed) that mocks @getbrevo/brevo and verifies:
// - SibGetTemplateId reads the HTML file correctly
// - SibSendTransacEmail passes correct template ID and params to Brevo API
// - Missing API key logs a warning and returns gracefully
```

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

### Phase 8 — `superagent` → native `fetch`

**Why separate:** `superagent` is unmaintained as of 2024. Node 18+ ships `fetch` natively. civil-client also uses superagent.

**civil-server usage:** `superagent` appears in `package.json` but grep for actual usages in server-side code first.  
**civil-client usage:** Used for API calls from the browser; civil-client must be updated in lockstep.

**Migration approach:**
1. Audit all `superagent` import sites in both repos with `grep -r "superagent" app/`.
2. Replace with `fetch` (browser-native and Node 18+ native) or a thin wrapper.
3. Key differences: `fetch` requires `await res.json()` for body; no `.send()` chaining; error handling is different (non-2xx does not throw by default).

**Verify:** All routes that make outbound HTTP calls (if any) work correctly.

**Tests to add** (wherever superagent calls are replaced):
```js
// Mock global.fetch and verify the calling code:
// - passes correct URL, method, and body
// - handles 200 and non-200 responses
// - handles network error
```

---

### Phase 9 — React 16 → React 19 *(Coordinate with civil-client)*

**This is the largest and highest-risk phase. It must be planned as a coordinated release across civil-server and civil-client.**

#### Sub-phase 9a — Remove `react-hot-loader`

`react-hot-loader` is unmaintained and incompatible with React 18+.

**Changes in civil-server:**
- `app/components/app.jsx`: Remove `import { hot } from 'react-hot-loader'` and the `hot(module)(App)` wrapper. Export `App` directly.
- `app/client/main-app.js`: No change required (uses `civil-client`'s `clientMain`).
- `webpack-dev.config.js`: The `entry.only-dev-server` `'webpack/hot/only-dev-server'` entry can be removed. Webpack 5's built-in `hot: true` HMR is sufficient.

**Changes in civil-client:**
- Same pattern: remove `react-hot-loader` usage from any component that wraps with `hot(module)`.
- The `clientMain` function in civil-client likely initializes the React app; update it to use `ReactDOM.createRoot()`.

#### Sub-phase 9b — Upgrade React packages

```
npm install react@^19 react-dom@^19
```

**Breaking changes to address:**

1. **`ReactDOM.render()` removed** — Must use `ReactDOM.createRoot()`:
   ```js
   // Before (React 16)
   ReactDOM.render(<App />, document.getElementById('root'))
   // After (React 19)
   const root = ReactDOM.createRoot(document.getElementById('root'))
   root.render(<App />)
   ```
   This change is in civil-client's `clientMain`. Update civil-client first.

2. **`renderToString` (server-side)** — Still works in React 19 but the output may differ slightly (no `data-reactroot` attribute). The `server-react-render.jsx` file uses `renderToString` from `react-dom/server`; verify SSR hydration still works.

3. **Automatic JSX transform** — With `@babel/preset-react` `{ runtime: 'automatic' }`, `import React from 'react'` is no longer needed in every JSX file. This is opt-in and can be added later; keep explicit imports for now to avoid a mass-edit.

4. **Strict Mode** — React 19 in StrictMode mounts/unmounts/remounts components in development. Effects and subscriptions must be cleanup-safe. Review any socket.io connection setup in components.

5. **`react-helmet`** — Has concurrent-mode issues in React 18+. Replace with `react-helmet-async`:
   ```
   npm uninstall react-helmet && npm install react-helmet-async
   ```
   API is nearly identical; wrap the app in `<HelmetProvider>`. This affects both `server-react-render.jsx` and `app.jsx`.
   
   In `server-react-render.jsx`:
   ```jsx
   // Before: const helmet = Helmet.renderStatic()
   // After: const { helmet } = helmetContext; (from HelmetProvider context)
   ```

6. **`react-jss`** — Verify v10.9.0 is compatible with React 19. JSS is generally stable but run tests.

#### Sub-phase 9c — Replace Enzyme with @testing-library/react

`enzyme-adapter-react-16` does not support React 18+. The `jest-test-setup.js` currently configures Enzyme.

**Steps:**
1. `npm uninstall enzyme enzyme-adapter-react-16 jest-enzyme`
2. `npm install --save-optional @testing-library/react @testing-library/jest-dom`
3. Update `jest-test-setup.js`: remove Enzyme configure; add `@testing-library/jest-dom` matchers.
4. Update `jest.config.js`: remove `jest-enzyme` from `setupFilesAfterEnv`.

**Tests to add** for React migration (new files):

*`app/components/__tests__/app.test.jsx`:*
```js
// Using @testing-library/react, render the App component
// Verify: renders without crashing with no props
// Verify: renders WebComponents when iota prop is provided
// Verify: renders "Nothing Here" when no iota
// Verify: ErrorBoundary catches a component error and doesn't crash the page
```

*`app/server/routes/__tests__/server-react-render.test.js`:*
```js
// Unit test the serverReactRender function (mock req/res)
// Verify: returns HTML string containing expected structure
// Verify: helmet tags are present in the rendered output
// Verify: user cookie is correctly parsed and passed as props
// Verify: JSS styles are injected into the response
```

**Verify:** `npm test`; manual SSR test by loading a page in the browser; verify no hydration warnings in the console.

---

### Phase 10 — `express` v4 → v5 *(Optional — Evaluate after Phase 9)*

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

### Phase 12 — civil-client: Storybook v6 → v8

This phase is scoped entirely to the civil-client repo. Storybook 8 has a completely different config directory format (`.storybook/`) and the webpack5 builder is now the default.

**Steps in civil-client:**
1. Run `npx storybook@latest upgrade` — this runs the automated migration codemod.
2. Update `.storybook/main.js` format as prompted.
3. Remove `@storybook/builder-webpack5` and `@storybook/manager-webpack5` (now built in).

**Verify:** `npm run storybook` in civil-client launches Storybook without errors.

---

## Testing Strategy Summary

The table below maps each phase to tests that should be written **before and after** the migration change to catch regressions.

| Phase | New Test File(s) | Key Assertions |
|-------|-----------------|----------------|
| 2 | `routes/__tests__/sign-in-rate-limit.js` | 429 after limit; correct handler option |
| 3 | `models/__tests__/user.js` (extend) | joi v17 email validation; error shapes |
| 5 | `routes/__tests__/doc-mddoc.js` | Markdown HTML output; 404 for missing doc |
| 6 | `lib/__tests__/send-in-blue-transactional.js` (extend) | Mock Brevo SDK; graceful missing-key handling |
| 8 | (per superagent call site) | fetch mock; correct URL/body/error handling |
| 9 | `components/__tests__/app.test.jsx` | React 19 render; ErrorBoundary; iota prop |
| 9 | `server/routes/__tests__/server-react-render.test.js` | SSR HTML; helmet tags; JSS styles |
| 10 | `routes/__tests__/sign-up.js` | All sign-up branch outcomes via supertest |
| 11 | `server/__tests__/logger-setup.js` | Logger init; no-throw on log calls |

---

## Coordination Points with Consuming Projects

Before releasing any phase that changes the exported API, publish a pre-release version of civil-server (e.g., `1.1.0-alpha.1`) and test it against at least one consuming project (e.g., civil-pursuit).

**API surface changes by phase:**

| Phase | Change | Consuming Project Impact |
|-------|--------|--------------------------|
| 3 | Joi v17 error messages differ | Any project inspecting `User.validate()` error text |
| 6 | Brevo SDK init; env var name preserved | Projects using `SibSendTransacEmail` directly |
| 9a | `App` exported directly (no `hot` wrapper) | Any project importing `App` from civil-server |
| 9b | React 19; `createRoot` in civil-client | civil-client must be updated in lockstep |
| 9b | `react-helmet` → `react-helmet-async`; needs `<HelmetProvider>` | Projects wrapping the app need HelmetProvider |
| 10 | `body-parser` removed | Consuming projects must use `express.json()` themselves if they depend on body-parser being already mounted |

---

## Suggested Phase Order and Branching Strategy

```
main
 └── phase/1-node20                 ← one PR per phase
 └── phase/2-low-risk-deps
 └── phase/3-joi-v17
 └── phase/4-cloudinary-v2
 └── phase/5-marked-v12
 └── phase/6-brevo-sdk
 └── phase/7-babel-transform-rename
 └── phase/8-superagent-removal
 └── phase/9-react-19              ← coordinate with civil-client branch
 └── phase/10-express-5            ← optional; may skip if cost/benefit is low
 └── phase/11-log4js-assessment
 └── phase/12-storybook-v8         ← in civil-client repo
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
