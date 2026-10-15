import React from 'react'
import vm from 'vm'
import setUserCookie from '../set-user-cookie'
import serverReactRender from '../server-react-render'

const id = JSON.stringify(['analytics', 'Custom Cookie'])

async function renderPage(consent) {
  const req = {
    cookies: { cc_cookie: consent && JSON.stringify(consent) },
    hostname: 'localhost', path: '/', url: '/',
    reactProps: { subject: 'Preserved prop' },
  }
  const res = { locals: {}, clearCookie: jest.fn(), send: jest.fn() }
  const next = jest.fn()
  const onAccepted = 'window.calls.push("accept"); window.marker = "</script><script>"; window.mode = window.process.env.NODE_ENV;'
  const onRevoked = 'window.calls.push("revoke");'
  await setUserCookie.call({ cookies: [{ name: 'Custom Cookie', category: 'analytics', onAccepted, onRevoked }] }, req, res, next)
  serverReactRender(() => <div>App</div>, req, res, next)
  expect(res.send).toHaveBeenCalledTimes(1)
  const html = res.send.mock.calls[0][0]
  const browser = { window: { calls: [] } }
  browser.document = {
    createElement: () => ({ remove() {} }),
    head: { appendChild: script => vm.runInNewContext(script.text, browser) },
  }
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(match[1], browser)
  return { html, browser, req }
}

test('delivers handlers separately from metadata, after environment and before client bundle', async () => {
  const { html, browser, req } = await renderPage({ categories: ['analytics'], services: { analytics: ['Custom Cookie'] } })
  expect(req.reactProps).toEqual({ subject: 'Preserved prop', cookieCategories: [{ id, name: 'Custom Cookie', category: 'analytics' }] })
  expect(JSON.stringify(browser.window.reactProps)).not.toContain('window.calls')
  expect(browser.window.calls).toEqual(['accept'])
  expect(browser.window.mode).toBeDefined()
  expect(browser.window.marker).toBe('</script><script>')
  expect(html.indexOf('window.encivCookieHandlers')).toBeLessThan(html.indexOf('/assets/webpack/main.js'))
  browser.window.encivCookieHandlers[id].onRevoked()
  expect(browser.window.calls).toEqual(['accept', 'revoke'])
})

test.each([
  undefined,
  { categories: ['analytics'], services: { analytics: [] } },
])('revokes unaccepted services on load and allows immediate acceptance', async consent => {
  const { browser } = await renderPage(consent)
  expect(browser.window.calls).toEqual(['revoke'])
  browser.window.encivCookieHandlers[id].onAccepted()
  expect(browser.window.calls).toEqual(['revoke', 'accept'])
})
