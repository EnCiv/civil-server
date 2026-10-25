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
NoSQL injection / token-probing risk. Both `isResetTokenExpired` and
`resetPassword` must reject non-string/empty inputs before querying Mongo.

> **Q (Justin B. Yee):** We do this validation in multiple areas for
> non-string or malformed strings. In the case we need to update the checks
> to be more stringent, would it be advisable to create a function to perform
> this check rather than doing it by equality in each function?
>
> **A:** Yes. As written, the plan already duplicates the same
> `typeof x !== 'string' || !x` check across `isResetTokenExpired` and
> `resetPassword` (3 call sites total). Extract it into a single helper, e.g.
> `app/lib/is-valid-reset-token.js`:
> ```js
> // tokens/keys are base64url(randomString(12)) — restrict to that charset, not just "truthy string"
> const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/
>
> export function isValidResetToken(value) {
>   return typeof value === 'string' && RESET_TOKEN_PATTERN.test(value)
> }
> ```
> That gives one place to tighten the rule later (e.g. enforcing the exact
> length produced by `base64url(randomString(12))`) instead of updating three
> call sites and risking one getting missed. Both `app/models/user.js`
> snippets below should call `isValidResetToken(...)` instead of the inline
> `typeof`/truthy check.

## Response contract

All reset-password-related socket APIs call back with a single JSON object:

```js
// success
cb({ success: true })

// failure
cb({ success: false, code: 'RESET_KEY_EXPIRED', message: 'This reset key has expired. Please request a new password reset email.' })
```

- `code` is machine-readable and stable, for any future client branching
  (e.g. showing a "resend email" button).
- `message` is the final, user-facing text. The client renders it as-is.

Error codes:

| code                  | meaning                                            |
| --------------------- | --------------------------------------------------- |
| `INVALID_RESET_KEY`   | token/key pair not found, no expiration date set, or malformed input |
| `RESET_KEY_EXPIRED`   | token found but past `tokenExpirationDate`          |
| `GENERIC_RESET_ERROR` | unexpected/unhandled failure (DB error, etc.)        |

`INVALID_RESET_KEY` vs `RESET_KEY_EXPIRED` is only ever decided *after* the
token and key both match in `resetPassword` (or after a token is found in the
precheck), so an attacker can't use the two codes to probe which half of a
guessed token/key pair is wrong. Don't add a separate "token found, key
wrong" code.

## Server changes (civil-server)

1. **`app/lib/reset-password-messages.js`** (new) — single source of truth
   mapping `code -> message`:
   ```js
   module.exports = {
     INVALID_RESET_KEY: 'This reset key is not valid. Please check your email and try again.',
     RESET_KEY_EXPIRED: 'This reset key has expired. Please request a new password reset email.',
     GENERIC_RESET_ERROR: 'An unknown error occurred while resetting your password. Please try again or contact support.',
   }
   ```

2. **`app/lib/is-valid-reset-token.js`** (new) — shared input-validation helper
   (see Q&A above), used by both `resetPassword` and `isResetTokenExpired`
   instead of each duplicating the same inline check:
   ```js
   // tokens/keys are base64url(randomString(12)) — restrict to that charset, not just "truthy string"
   const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

   export function isValidResetToken(value) {
     return typeof value === 'string' && RESET_TOKEN_PATTERN.test(value)
   }
   ```

3. **`app/models/user.js`** — change `User.resetPassword` to *return* a result
   object instead of throwing for expected failures, and reject invalid
   inputs before querying:
   ```js
   const { isValidResetToken } = require('../lib/is-valid-reset-token')

   static async resetPassword(activationToken, activationKey, newPassword) {
     if (!isValidResetToken(activationToken)) return { success: false, code: 'INVALID_RESET_KEY' }
     if (!isValidResetToken(activationKey)) return { success: false, code: 'INVALID_RESET_KEY' }
     const user = await User.findOne({ activationToken, activationKey })
     if (!user || !user.tokenExpirationDate) return { success: false, code: 'INVALID_RESET_KEY' }
     if (User.isTokenExpirationDateExpired(user.tokenExpirationDate)) {
       return { success: false, code: 'RESET_KEY_EXPIRED' }
     }
     const hash = await bcrypt.hash(newPassword, 10)
     await User.updateOne(
       { activationKey, activationToken },
       { $set: { password: hash, activationKey: '', activationToken: '', tokenExpirationDate: '' } }
     )
     return { success: true }
   }
   ```
   > **Note:** validation is delegated to `isValidResetToken()` rather than
   > repeating `typeof x !== 'string' || !x` inline, so tightening the rule
   > later only requires editing one file.

   No `throw` for the "not found" / "missing" / "expired" / "bad input" cases.
   Unexpected errors (e.g. `bcrypt.hash` or `updateOne` rejecting) are allowed
   to propagate as real exceptions — those are infrastructure failures, not
   business outcomes.

   Also update `User.isResetTokenExpired` to the same pattern — reject
   invalid input via the same helper, and return a `code` so the precheck can
   tell "never a valid token" apart from "was valid, now expired":
   ```js
   static async isResetTokenExpired(activationToken) {
     if (!isValidResetToken(activationToken)) return { expired: true, code: 'INVALID_RESET_KEY' }
     const user = await User.findOne({ activationToken })
     if (!user) return { expired: true, code: 'INVALID_RESET_KEY' }
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
       const { expired, code } = await User.isResetTokenExpired(activationToken)
       cb({ success: true, expired, code, message: code && messages[code] })
     } catch (error) {
       logger.error('unexpected error checking reset token: ', error.toString())
       cb({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
     }
   }
   ```

6. **`app/web-components/reset-password.js`** — update the `check-reset-token`
   callback to read the new response shape, keeping `code`/`message` around so
   they can be passed down to the client component:
   ```js
   window.socket.emit('check-reset-token', activationToken, response => {
     if (!response.success) return console.error('check-reset-token failed:', response.message)
     setExpired(!!response.expired)
     setExpiredMessage(response.message || '')
   })
   ```

7. **Tests**
   - New `app/lib/__tests__/is-valid-reset-token.js`: valid tokens, empty
     string, non-string/object input (e.g. `{ $regex: '^a' }`), and
     disallowed characters.
   - `app/models/__tests__/user.js`: replace `.rejects.toThrow(...)` expectations
     for `resetPassword` with assertions on the returned `{ success, code }`
     object (not-found, expired, success, and invalid-input cases). Add
     `isResetTokenExpired` cases for object/non-string input (e.g.
     `{ $regex: '^a' }`) to confirm it returns `INVALID_RESET_KEY` without
     querying Mongo.
   - New `app/socket-apis/__tests__/reset-password.js` and
     `check-reset-token.js`: assert the exact JSON shape passed to `cb()` for
     each case, including the unexpected-error path, **and assert `cb` is
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
   - Currently `expired` is passed down from the civil-server wrapper as a
     prop but never destructured or used — the component always renders the
     normal form. Accept `expired` (and a `message` prop for the expired-state
     text) and render an expired-state view instead of the form when
     `expired` is true, so the server-driven status is actually visible to
     the user. (Only the *display* of the expired state — an actual
     "resend email" action is out of scope, see below.)

## Out of scope / follow-up

- Adding an actual "resend email" button/action triggered by the
  `RESET_KEY_EXPIRED` code — flagged by Copilot's review on civil-client#15.
  This plan only makes the expired state *visible* (see client changes
  above); sending a new email is a larger UX/API addition, not just response
  plumbing.
- The civil-pursuit "password never set" wording distinction mentioned in
  civil-server#65.
