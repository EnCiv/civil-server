'use strict'

// tokens/keys are base64url(randomString(12)), which is 16 chars of [A-Za-z0-9_-].
// Restrict to that charset (not a fixed length, in case legacy tokens differ), not just "truthy string".
// Keep `+` (not `*`): cleared tokens are stored as '', so '' must be rejected.
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

export function isValidResetToken(value) {
  return typeof value === 'string' && RESET_TOKEN_PATTERN.test(value)
}
