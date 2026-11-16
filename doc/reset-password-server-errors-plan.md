# Plan: Move reset-password error messages to the server

Tracking: [civil-server#65](https://github.com/EnCiv/civil-server/issues/65)
Related work: [civil-server#68](https://github.com/EnCiv/civil-server/pull/68), [civil-client#15](https://github.com/EnCiv/civil-client/pull/15)

## Goal

The `reset-password` socket API currently returns a raw error string to the
client, which then guesses the cause by substring-matching the message
(`parseResetPasswordError` in `civil-client/app/components/auth-form/reset-password.jsx`).
Instead, the server should determine the user-facing error message and return
a JSON object via `cb()`. The client should just display `message` with no
parsing.

**Constraint: avoid throwing errors for expected/business-logic failures**
(invalid reset key, expired token, etc.). These are normal outcomes of a
reset-password attempt, not exceptional conditions, so they should be
represented as a returned result object with a `code`, not a thrown
`Error`. `try/catch` is kept only as a defensive safety net around truly
unexpected failures (e.g. a DB call rejecting), not as the primary control
flow.

**Constraint: validate inputs before querying.** `activationToken` and
`activationKey` come straight from an unauthenticated socket call with no
sanitization layer in front of it (see `app/server/socket-api.js`). Passing a
non-string (e.g. `{ $regex: '^a' }`) straight into `User.findOne(...)` is a
NoSQL injection / token-probing risk. Both `checkResetToken` and
`resetPassword` must reject non-string/empty inputs before querying Mongo.
`newPassword` gets the same treatment (a non-string would make `bcrypt.hash`
throw and surface as a misleading `GENERIC_RESET_ERROR`).

> **Q (Justin B. Yee):** We do this validation in multiple areas for
> non-string or malformed strings. In the case we need to update the checks
> to be more stringent, would it be advisable to create a function to perform
> this check rather than doing it by equality in each function?
>
> **A:** Yes. As written, the plan already duplicates the same
> `typeof x !== 'string' || !x` check across `checkResetToken` and
> `resetPassword` (3 call sites total). Extract it into a single helper,
> `app/lib/is-valid-reset-token.js` (code in server step 2 below), so there is
> one place to tighten the rule later (e.g. enforcing the exact 16-char length
> produced by `base64url(randomString(12))`, once we're sure no legacy tokens
> differ) instead of updating three call sites and risking one getting missed.
> Both `app/models/user.js` snippets below should call `isValidResetToken(...)`
> instead of the inline `typeof`/truthy check.

## Response contract

All reset-password-related socket APIs call back with a single JSON object:

```js
// success
cb({ success: true })

// failure
cb({ success: false, code: 'RESET_KEY_EXPIRED', message: 'This reset key has expired. Please enter your email and we will send a new one.' })
```

- `code` is machine-readable and stable, for any future client branching
  (e.g. showing a "resend email" button).
- `message` is the final, user-facing text. The client renders it as-is.

Error codes:

| code                  | meaning                                            |
| --------------------- | --------------------------------------------------- |
| `INVALID_RESET_KEY`   | token/key pair not found, no expiration date set, or malformed input |
| `RESET_KEY_EXPIRED`   | token found but past `tokenExpirationDate`          |
| `INVALID_PASSWORD`    | `newPassword` is not a non-empty string (checked before any DB lookup) |
| `GENERIC_RESET_ERROR` | unexpected/unhandled failure (DB error, etc.)        |

`INVALID_RESET_KEY` vs `RESET_KEY_EXPIRED` is only ever decided *after* the
token and key both match in `resetPassword` (or after a token is found in the
precheck), so an attacker can't use the two codes to probe which half of a
guessed token/key pair is wrong. Don't add a separate "token found, key
wrong" code.

Known, accepted exception: `check-reset-token` takes only the token, so
`INVALID_RESET_KEY` vs `RESET_KEY_EXPIRED` does reveal whether a token exists.
Tokens are 96 bits of randomness, so guessing one is infeasible; this is
documented rather than changed.

## Server changes (civil-server)

1. **`app/lib/reset-password-messages.js`** (new) — single source of truth
   mapping `code -> message` (uses `export`, matching the other `app/lib` files):
   ```js
   export default {
     INVALID_RESET_KEY: 'This reset key is not valid. Please check your email and try again.',
     RESET_KEY_EXPIRED: 'This reset key has expired. Please enter your email and we will send a new one.',
     INVALID_PASSWORD: 'Please enter a valid new password.',
     GENERIC_RESET_ERROR: 'An unknown error occurred while resetting your password. Please try again or contact support.',
   }
   ```

2. **`app/lib/is-valid-reset-token.js`** (new) — shared input-validation helper
   (see Q&A above), used by both `resetPassword` and `checkResetToken`
   instead of each duplicating the same inline check:
   ```js
   // tokens/keys are base64url(randomString(12)), which is 16 chars of [A-Za-z0-9_-].
   // Restrict to that charset (not a fixed length, in case legacy tokens differ), not just "truthy string".
   // Keep `+` (not `*`): cleared tokens are stored as '', so '' must be rejected.
   const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

   export function isValidResetToken(value) {
     return typeof value === 'string' && RESET_TOKEN_PATTERN.test(value)
   }
   ```

3. **`app/models/user.js`** — add the helper import at the top of the file
   with the other requires:
   ```js
   const { isValidResetToken } = require('../lib/is-valid-reset-token')
   ```
   Then change `User.resetPassword` to *return* a result object instead of
   throwing for expected failures, reject invalid inputs before querying, and
   claim the token atomically so two simultaneous requests with the same
   token can't both succeed (today's `findOne` then `updateOne` lets both
   pass the `findOne`):
   ```js
   static async resetPassword(activationToken, activationKey, newPassword) {
     if (!isValidResetToken(activationToken)) return { success: false, code: 'INVALID_RESET_KEY' }
     if (!isValidResetToken(activationKey)) return { success: false, code: 'INVALID_RESET_KEY' }
     if (typeof newPassword !== 'string' || !newPassword) return { success: false, code: 'INVALID_PASSWORD' }
     const user = await User.findOne({ activationToken, activationKey })
     if (!user || !user.tokenExpirationDate) return { success: false, code: 'INVALID_RESET_KEY' }
     if (User.isTokenExpirationDateExpired(user.tokenExpirationDate)) {
       return { success: false, code: 'RESET_KEY_EXPIRED' }
     }
     const hash = await bcrypt.hash(newPassword, 10)
     // the filter still requires the token/key, which the first successful request clears,
     // so a concurrent second request matches nothing
     const { matchedCount } = await User.updateOne(
       { activationKey, activationToken },
       { $set: { password: hash, activationKey: '', activationToken: '', tokenExpirationDate: '' } }
     )
     if (!matchedCount) return { success: false, code: 'INVALID_RESET_KEY' }
     return { success: true }
   }
   ```
   `@enciv/mongo-collections` exposes the driver's collection methods
   directly, so `updateOne` returns the native `UpdateResult` with
   `matchedCount`. Nothing in this repo reads that result today, so the
   success-path test (user's password actually changes) is what proves it.
   The hash is deliberately computed *after* the cheap `findOne` check, not
   before a single `findOneAndUpdate`: hashing first would let anyone sending
   well-formed but bogus tokens force a bcrypt computation per request. Only
   the losing racer in a true race wastes a hash.
   > **Note:** validation is delegated to `isValidResetToken()` rather than
   > repeating `typeof x !== 'string' || !x` inline, so tightening the rule
   > later only requires editing one file. The password check comes after the
   > token/key format checks and before any DB access. It is a server-side
   > backstop only: the client already blocks empty passwords, so civil-client
   > needs no change for it. It reveals nothing
   > about whether a token exists.

   No `throw` for the "not found" / "missing" / "expired" / "bad input" cases.
   Unexpected errors (e.g. `bcrypt.hash` or `updateOne` rejecting) are allowed
   to propagate as real exceptions — those are infrastructure failures, not
   business outcomes.

   Also update `User.isResetTokenExpired` to the same pattern — reject
   invalid input via the same helper, and return a `code` so the precheck can
   tell "never a valid token" apart from "was valid, now expired". Since it no
   longer returns a boolean, rename it to `User.checkResetToken` (update
   `app/socket-apis/check-reset-token.js` and tests accordingly). A missing
   `tokenExpirationDate` is `INVALID_RESET_KEY` here, exactly as in
   `resetPassword`, so both paths agree for the same record:
   ```js
   static async checkResetToken(activationToken) {
     if (!isValidResetToken(activationToken)) return { expired: true, code: 'INVALID_RESET_KEY' }
     const user = await User.findOne({ activationToken })
     if (!user || !user.tokenExpirationDate) return { expired: true, code: 'INVALID_RESET_KEY' }
     const expired = User.isTokenExpirationDateExpired(user.tokenExpirationDate)
     return { expired, code: expired ? 'RESET_KEY_EXPIRED' : undefined }
   }
   ```
   > **Note:** same `isValidResetToken()` helper as `resetPassword` above —
   > both reject malformed input the same way, by construction.

4. **`app/socket-apis/reset-password.js`** — consume the result object and
   build the JSON `cb()` response; keep `try/catch` only for unexpected
   exceptions, fixing the existing double-`cb()` call bug. Also rename the
   params to match what's actually emitted and what `User.resetPassword`
   expects — today's `(activationKey, activationToken, ...)` naming is
   swapped relative to the client's `(token, resetKey, ...)` emit order; it
   happens to work because the swap cancels out when forwarded to
   `User.resetPassword(activationToken, activationKey, ...)`, but it's
   confusing and should be fixed while this file is being rewritten:
   ```js
   import User from '../models/user'
   import messages from '../lib/reset-password-messages'

   async function resetPassword(activationToken, activationKey, newPassword, cb) {
     try {
       const result = await User.resetPassword(activationToken, activationKey, newPassword)
       if (!result.success) {
         logger.warn('reset-password rejected: ', result.code)
         cb({ success: false, code: result.code, message: messages[result.code] })
         return
       }
       cb({ success: true })
     } catch (error) {
       logger.error('unexpected error resetting password: ', error.toString())
       cb({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
     }
   }

   export default resetPassword
   ```
   Note `logger.warn` for expected rejections (`INVALID_RESET_KEY`,
   `RESET_KEY_EXPIRED`) vs. `logger.error` reserved for the unexpected-failure
   path — matches the existing convention in `app/socket-apis/send-password.js`
   (`logger.warn('no user found with email:', email)`).

5. **`app/socket-apis/check-reset-token.js`** — align to the same shape so a
   missing/invalid/expired token on the precheck also returns a `code` and
   `message`, not just a boolean:
   ```js
   async function checkResetToken(activationToken, cb) {
     try {
       const { expired, code } = await User.checkResetToken(activationToken)
       cb({ success: true, expired, code, message: code && messages[code] })
     } catch (error) {
       logger.error('unexpected error checking reset token: ', error.toString())
       cb({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
     }
   }
   ```

6. **`app/web-components/reset-password.js`** — update the `check-reset-token`
   callback to read the new response shape and render the expired state in
   this wrapper (no form) so this PR is correct on its own without waiting
   for a civil-client merge and dependency bump. The wrapper branch can be
   dropped once civil-client handles the `expired` prop itself.

   **No flash of the form:** today the form renders immediately with
   `expired = false` and is swapped out when the precheck returns. Instead,
   track the precheck as `check` (`null` = pending) and show a
   "Checking your link..." placeholder instead of the form until it resolves,
   so the user always sees *something* while waiting. Every path must resolve
   `check`, including a precheck that never calls back (e.g. the server
   handler never invokes `cb`, or the socket stays disconnected), so the
   precheck has a timeout that falls back to the form:
   ```js
   const PRECHECK_TIMEOUT_MS = 5000 // a guess; tune if the precheck is normally slower than this
   const [check, setCheck] = useState(null) // null = precheck pending

   useEffect(() => {
     const urlParams = new URLSearchParams(document.location.search)
     setParams(urlParams)
     const activationToken = urlParams.get('t')
     // no token or no socket: nothing to check, show the form (client reports MISSING_RESET_KEY)
     if (!activationToken || !window.socket) return setCheck({ expired: false })

     let settled = false
     let timer
     const settle = result => {
       if (settled) return // first outcome wins; late callbacks and unmount are ignored
       settled = true
       clearTimeout(timer)
       setCheck(result)
     }
     // precheck failed or timed out: show the form anyway, reset-password re-validates on submit
     timer = setTimeout(() => {
       console.error('check-reset-token timed out')
       settle({ expired: false })
     }, PRECHECK_TIMEOUT_MS)
     window.socket.emit('check-reset-token', activationToken, response => {
       if (!response?.success) {
         console.error('check-reset-token failed:', response?.message)
         return settle({ expired: false })
       }
       settle({ expired: !!response.expired, message: response.message })
     })
     return () => {
       settled = true
       clearTimeout(timer)
     }
   }, [])

   // add `expired` and `checking` rules to the wrapper's useStyles (neither exists today)

   // render (inside centeredWrapper)
   {!check ? (
     <div className={classes.checking}>Checking your link...</div>
   ) : check.expired ? (
     <div className={classes.expired}>{check.message}</div>
   ) : (
     <ClientResetPassword activationToken={params?.get('t') || ''} returnTo={params?.get('p') || ''} />
   )}
   ```
   Behavior by case:
   - **Resolves quickly:** placeholder, then form or expired message. No form
     is ever shown and then replaced.
   - **Resolves late (after the timeout):** the form is already showing and the
     late result is ignored, so a half-typed form is never swapped out from
     under the user. The only loss is the early "expired" notice; submitting
     still gets `RESET_KEY_EXPIRED` from `reset-password`, which is the
     authoritative check anyway.
   - **Never resolves:** after `PRECHECK_TIMEOUT_MS` the form appears (same
     fallback as a failed precheck) and the timeout is logged.
   - **Socket not yet connected:** socket.io buffers the emit until it
     connects, so a slow connect is covered by the same timeout.

   `message` is only ever set when `expired` is true, and the client component
   gets no `expired`/`message` props from the wrapper (it would always be
   `false`/empty there).

7. **Tests**
   - New `app/lib/__tests__/is-valid-reset-token.js`: valid tokens, empty
     string, non-string/object input (e.g. `{ $regex: '^a' }`), and
     disallowed characters.
   - `app/models/__tests__/user.js`:
     - `resetPassword`: replace `.rejects.toThrow(...)` expectations with
       assertions on the returned `{ success, code }` object (not-found,
       expired, success, and invalid-input cases).
     - `checkResetToken` (renamed from `isResetTokenExpired`): update the
       existing assertions from a boolean to `{ expired, code }`, including
       the missing-`tokenExpirationDate` case returning `INVALID_RESET_KEY`.
     - Both: object/non-string input (e.g. `{ $regex: '^a' }`) returns
       `INVALID_RESET_KEY` without querying Mongo, and so does the empty
       string (cleared tokens are stored as `''`, so an unchecked `''` would
       match users who already reset).
     - `resetPassword` with a non-string or empty `newPassword` returns
       `INVALID_PASSWORD`, does not query Mongo, and leaves the token intact.
     - `resetPassword` race: two concurrent calls (`Promise.all`) with the same
       valid token/key yield exactly one `{ success: true }` and one
       `INVALID_RESET_KEY`.
   - New `app/components/__tests__/reset-password.js` (not under
     `app/web-components/`: `react-directory-indexer` lists every entry in that
     directory, including `__tests__`, and the build ignores `__tests__`, so the
     generated index would `require` a directory that doesn't exist; jsdom via
     `@testing-library/react`, jest fake timers, `jest.mock('civil-client')`
     for `ResetPassword`, a stub `window.socket.emit`): placeholder shown
     while pending; form after a non-expired result; expired message after an
     expired result (and no form); form after `success: false`; form after a
     `null`/`undefined` response (no throw); form after the 5s timeout with the
     timeout logged; a result arriving after the timeout is ignored; no state
     update (no React warning) if unmounted before the callback fires; no
     token in the URL shows the form without emitting.
   - `cypress/integration/02-reset-password.spec.js`: the "Bad Reset Key" case
     asserts the old text ("Error resetting password, please try again or
     contact support"); update it to the new `INVALID_RESET_KEY` message
     ("This reset key is not valid..."). Add an expired-token case that
     expects the expired message and no form. No new seeding helper is
     needed: the spec's `insertUser` goes through `mongo --eval` with
     `JSON.stringify`, so a `Date` is stored as an ISO string, which
     `isTokenExpirationDateExpired` parses with `new Date(...)`. Seed
     `tokenExpirationDate: new Date(Date.now() - 11 * 60 * 1000)` the same way
     (the expiry window is 10 minutes).
   - New `app/socket-apis/__tests__/reset-password.js` and
     `check-reset-token.js`: assert the exact JSON shape passed to `cb()` for
     each case, including the unexpected-error path and an object-valued token
     (e.g. `{ $regex: '^a' }`) that must produce `INVALID_RESET_KEY` with
     `User.findOne` never called, **and assert `cb` is
     called exactly once per request** (regression test for the existing
     double-`cb()` bug).
   - Confirmed via grep: the only caller of `reset-password` is
     `civil-client/app/components/auth-form/reset-password.jsx`, and the only
     caller of `check-reset-token` is
     `civil-server/app/web-components/reset-password.js` — no other consumers
     need updating.

## Coordination with civil-client

This is a breaking change to both socket APIs' `cb()` shape, split across two
repos/PRs (civil-server#68 and civil-client#15). Both local checkouts are on
the same `resetpassword-errors#65` branch, so both sides can be edited
together in this pass, but they still need separate PR review/merge. Note
that `civil-server`'s `peerDependencies.civil-client` currently resolves to
`civil-client@0.0.21` (pre-dates civil-client#15) — editing the local
civil-client checkout has no effect on civil-server's real install until
civil-client#15 is merged and that dependency is bumped to the new commit/tag.

The server wrapper renders the expired state itself (server step 6), so
users see it before civil-client#15 lands. The one piece that needs the
client change is the `onExpired` prop (an expiry discovered on submit); with
an older client that case just shows the message as a form error.

## Client changes (civil-client)

1. **`app/components/auth-form/reset-password.jsx`**:
   - Remove `parseResetPasswordError`, `INVALID_RESET_KEY`, `RESET_KEY_EXPIRED`,
     `GENERIC_RESET_ERROR` (server-owned now). Keep only the purely
     client-side validation strings that never reach the server
     (`MISSING_RESET_KEY`, `MISSING_PASSWORDS`, `PASSWORD_MISMATCH_ERROR`).
   - Update the `reset-password` emit callback to read the response object:
     ```js
     window.socket.emit('reset-password', token, resetKey, newPassword, response => {
       if (!response.success) {
         setInfoMessage('')
         setFormError(response.message)
         console.error('Error resetting password: ', response.code)
         return
       }
       setInfoMessage('Your password was successfully reset! Redirecting you back...')
       setFormError('')
       setTimeout(() => (location.href = returnTo || '/join'), 800)
     })
     ```
   - Add an optional `onExpired` prop. When `reset-password` calls back with
     `RESET_KEY_EXPIRED` and `onExpired` is set, call `onExpired(response.message)`
     instead of showing the message in the form, so the host page can switch
     to the resend view below. Without the prop the message is shown as a
     form error, as before.
   - The expired view itself lives in the civil-server wrapper (server step
     6), not in civil-client, so it works before a civil-client bump. If
     civil-client should own it later, the wrapper's expired branch can be
     dropped.

## Resend a new email from the expired view

The expired message is now "This reset key has expired. Please enter your
email and we will send a new one." The wrapper's expired view shows that
message with an email input and a Send button. It reuses the login page's
Forgot Password flow rather than adding a new API: it emits the existing
`send-password` event with `(email, returnTo, cb)`, where `returnTo` is the
page's `p` parameter (not `window.location.pathname`, which here is
`/resetPassword`), and uses the same wording ("Message sent! Please check
your inbox", `User not found` shown as "Email not found"). It also treats a
bare-string callback as an error, since `send-password` calls back with a
string when the email fails to send.

The same view appears when a reset is *submitted* after the key expires:
the civil-client form reports it through `onExpired`.

Known and inherited from `send-password`, not changed here: it reports
whether an email is registered ("Email not found"), and it is unauthenticated
and unthrottled.

## Out of scope / follow-up

- The civil-pursuit "password never set" wording distinction mentioned in
  civil-server#65.
- Trimming whitespace from the reset key the user types (civil-client
  `reset-password.jsx` does not trim). A key pasted with a trailing space is
  rejected, same as today's exact-match lookup, so this is not a regression.
