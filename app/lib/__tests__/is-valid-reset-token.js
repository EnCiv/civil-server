const { isValidResetToken } = require('../is-valid-reset-token')
const { base64url } = require('../base64url')
const { randomString } = require('../random-string')

describe('isValidResetToken', () => {
  test('accepts tokens generated the way the server generates them', () => {
    for (let i = 0; i < 50; i++) expect(isValidResetToken(base64url(randomString(12)))).toBe(true)
  })

  test('accepts base64url charset', () => {
    expect(isValidResetToken('abcXYZ019_-')).toBe(true)
  })

  test('rejects the empty string (cleared tokens are stored as empty strings)', () => {
    expect(isValidResetToken('')).toBe(false)
  })

  test('rejects non-strings', () => {
    expect(isValidResetToken({ $regex: '^a' })).toBe(false)
    expect(isValidResetToken({ $ne: '' })).toBe(false)
    expect(isValidResetToken(['abc'])).toBe(false)
    expect(isValidResetToken(123)).toBe(false)
    expect(isValidResetToken(null)).toBe(false)
    expect(isValidResetToken(undefined)).toBe(false)
  })

  test('rejects disallowed characters', () => {
    expect(isValidResetToken('abc def')).toBe(false)
    expect(isValidResetToken(' abcdef')).toBe(false)
    expect(isValidResetToken('abcdef\n')).toBe(false)
    expect(isValidResetToken('abc+def')).toBe(false)
    expect(isValidResetToken('abc/def')).toBe(false)
    expect(isValidResetToken('abc=')).toBe(false)
    expect(isValidResetToken('$regex')).toBe(false)
  })
})
