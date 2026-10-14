import vm from 'vm'
import HttpServer from '../the-civil-server'

jest.mock('../socket-api', () => jest.fn())
jest.mock('../routes/server-react-render', () => jest.fn())
jest.mock('../../components/app', () => jest.fn())
jest.mock('../util/mongo-logger', () => ({ createMongoAppender: jest.fn() }))
jest.mock('civil-client/app/client/logger', () => ({ createLogger: () => ({}) }))

test('registers Google Analytics by default without executing browser callbacks', () => {
  const on = jest.spyOn(process, 'on').mockReturnValue(process)
  try {
    const server = new HttpServer()
    expect(server.cookies).toHaveLength(1)
    expect(server.cookies[0]).toMatchObject({ name: 'Google Analytics', category: 'analytics', accepted: false })
    expect(typeof server.cookies[0].onAccepted).toBe('string')
    expect(typeof server.cookies[0].onRevoked).toBe('string')
    const browser = { window: { process: { env: { GOOGLE_ANALYTICS: 'G-TEST' } } }, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: jest.fn() } } }
    browser.window['ga-disable-G-TEST'] = true
    vm.runInNewContext(server.cookies[0].onAccepted, browser)
    expect(browser.window['ga-disable-G-TEST']).toBe(false)
    expect(browser.document.head.appendChild).toHaveBeenCalledWith(expect.objectContaining({ id: 'googletagmanager' }))
  } finally {
    on.mockRestore()
  }
})

test.each([
  function () { window.accepted = true },
  () => { window.accepted = true },
  { onAccepted() { window.accepted = true } }.onAccepted,
  async () => { window.accepted = true },
])('serializes browser callbacks without running them on the server (%#)', callback => {
  const server = { cookies: [] }
  HttpServer.prototype.addCookie.call(server, { name: 'test', category: 'analytics', onAccepted: callback, onRevoked: function () { window.accepted = false } })
  const browser = { window: {} }
  vm.runInNewContext(server.cookies[0].onAccepted, browser)
  expect(browser.window.accepted).toBe(true)
  vm.runInNewContext(server.cookies[0].onRevoked, browser)
  expect(browser.window.accepted).toBe(false)
})

test('preserves existing source strings and omitted callbacks', () => {
  const server = { cookies: [] }
  HttpServer.prototype.addCookie.call(server, { name: 'test', category: 'analytics', onAccepted: 'window.accepted = true;' })
  expect(server.cookies[0]).toMatchObject({ accepted: false, onAccepted: 'window.accepted = true;', onRevoked: undefined })
})
