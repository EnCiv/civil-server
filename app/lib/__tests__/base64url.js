const { base64url } = require('../base64url')

test('base64url function converts input', () => {
  const output = base64url('stuff=things')
  expect(output).not.toContain('stuff')
  expect(output).not.toContain('things')
  expect(output).not.toContain('=')
  expect(output).not.toContain('/')
  expect(output).not.toContain('+')
})
