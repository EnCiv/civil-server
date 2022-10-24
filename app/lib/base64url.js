'use strict'

// taken from https://github.com/brianloveswords/base64url/blob/master/src/base64url.ts

export function base64url(input, encoding = 'utf8') {
  return fromBase64(Buffer.from(input, encoding).toString('base64'))
}

function fromBase64(base64) {
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
