const { randomString } = require('../random-string')

describe('random string returns correct length', () => {
  test('length of 12', () => {
    expect(randomString(12).length).toBe(12)
  })

  test('length of 0', () => {
    expect(randomString(0).length).toBe(0)
  })

  test('max length is 64', () => {
    expect(randomString(100).length).toBe(64)
  })
})
