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
| `INVALID_RESET_KEY`   | token/key pair not found, or no expiration date set |
| `RESET_KEY_EXPIRED`   | token found but past `tokenExpirationDate`          |
| `GENERIC_RESET_ERROR` | unexpected/unhandled failure (DB error, etc.)        |

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

2. **`app/models/user.js`** — change `User.resetPassword` to *return* a result
   object instead of throwing for expected failures:
   ```js
   static async resetPassword(activationToken, activationKey, newPassword) {
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
   No `throw` for the "not found" / "missing" / "expired" cases. Unexpected
   errors (e.g. `bcrypt.hash` or `updateOne` rejecting) are allowed to
   propagate as real exceptions — those are infrastructure failures, not
   business outcomes.

3. **`app/socket-apis/reset-password.js`** — consume the result object and
   build the JSON `cb()` response; keep `try/catch` only for unexpected
   exceptions, fixing the existing double-`cb()` call bug:
   ```js
   import User from '../models/user'
   import messages from '../lib/reset-password-messages'

   async function resetPassword(activationKey, activationToken, newPassword, cb) {
     try {
       const result = await User.resetPassword(activationKey, activationToken, newPassword)
       if (!result.success) {
         logger.error('error resetting password: ', result.code)
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

4. **`app/socket-apis/check-reset-token.js`** — align to the same shape so a
   missing/invalid token on the precheck also returns a `message`, not just a
   boolean. `User.isResetTokenExpired` already avoids throwing for the
   "not found" case (returns `true`), so this mainly wraps the response:
   ```js
   async function checkResetToken(activationToken, cb) {
     try {
       const expired = await User.isResetTokenExpired(activationToken)
       cb({ success: true, expired })
     } catch (error) {
       logger.error('error checking reset token: ', error.toString())
       cb({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
     }
   }
   ```

5. **`app/web-components/reset-password.js`** — update the `check-reset-token`
   callback to read the new response shape:
   ```js
   window.socket.emit('check-reset-token', activationToken, response => {
     if (!response.success) return console.error('check-reset-token failed:', response.message)
     setExpired(!!response.expired)
   })
   ```

6. **Tests**
   - `app/models/__tests__/user.js`: replace `.rejects.toThrow(...)` expectations
     for `resetPassword` with assertions on the returned `{ success, code }`
     object (not-found, expired, and success cases).
   - New `app/socket-apis/__tests__/reset-password.js` and
     `check-reset-token.js`: assert the exact JSON shape passed to `cb()` for
     each case, including the unexpected-error path.

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

## Out of scope / follow-up

- Wiring the `RESET_KEY_EXPIRED` code (or the existing `expired` prop) to an
  actual "resend email" button/flow — flagged by Copilot's review on
  civil-client#15, but it's a larger UX/API addition, not just response
  plumbing.
- The civil-pursuit "password never set" wording distinction mentioned in
  civil-server#65.
