'use strict'

import crypto from 'crypto'

export function randomString(size) {
  return crypto.randomBytes(48).toString('base64').slice(0, size)
}
