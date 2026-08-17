import setCookieUser from '../set-user-cookie'

if (!global.logger) global.logger = console

const makeCookieConsent = (categories, services) => JSON.stringify({ categories, ...(services && { services }) })

const makeReq = (categories, services) => ({
  cookies: {
    cc_cookie: categories ? makeCookieConsent(categories, services) : undefined,
    synuser: undefined,
  },
  user: undefined,
})

const makeRes = () => ({
  clearCookie: jest.fn(),
  cookie: jest.fn(),
})

const makeContext = (cookies = []) => ({
  cookies,
  socketAPI: { validateUserCookie: jest.fn() },
})

describe('processCookieConsent', () => {
  test('collects the onAccepted script when category is accepted', async () => {
    const context = makeContext([{ name: 'analytics', category: 'analytics', onAccepted: 'ACCEPT_SCRIPT' }])
    const req = makeReq(['necessary', 'analytics'])

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).toContain('ACCEPT_SCRIPT')
    expect(context.cookies[0].accepted).toBe(true)
  })

  test('collects the onRevoked script when category is not accepted', async () => {
    const context = makeContext([{ name: 'analytics', category: 'analytics', onRevoked: 'REVOKE_SCRIPT' }])
    const req = makeReq(['necessary'])

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).toContain('REVOKE_SCRIPT')
    expect(context.cookies[0].accepted).toBe(false)
  })

  test('does not collect the onAccepted script when no consent cookie is present', async () => {
    const context = makeContext([{ name: 'analytics', category: 'analytics', onAccepted: 'ACCEPT_SCRIPT' }])
    const req = makeReq(null)

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).not.toContain('ACCEPT_SCRIPT')
  })

  test('handles multiple cookies across different categories independently', async () => {
    const context = makeContext([
      { name: 'ga', category: 'analytics', onAccepted: 'GA_ACCEPT' },
      { name: 'ads', category: 'marketing', onRevoked: 'ADS_REVOKE' },
    ])
    const req = makeReq(['necessary', 'analytics'])

    // analytics accepted, marketing revoked
    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).toEqual(expect.arrayContaining(['GA_ACCEPT', 'ADS_REVOKE']))
    expect(context.cookies[0].accepted).toBe(true)
    expect(context.cookies[1].accepted).toBe(false)
  })
})

describe('hasRequiredCookieConsent gate', () => {
  test('clears synuser cookie when no cc_cookie is present', async () => {
    const context = makeContext()
    const res = makeRes()

    await setCookieUser.call(context, makeReq(null), res, jest.fn())

    expect(res.clearCookie).toHaveBeenCalledWith('synuser')
    expect(res.cookie).not.toHaveBeenCalled()
  })

  test('clears synuser cookie when necessary category is not accepted', async () => {
    const context = makeContext()
    const res = makeRes()

    await setCookieUser.call(context, makeReq(['analytics']), res, jest.fn())

    expect(res.clearCookie).toHaveBeenCalledWith('synuser')
    expect(res.cookie).not.toHaveBeenCalled()
  })

  test('does not clear synuser cookie when necessary category is accepted', async () => {
    const context = makeContext()
    const res = makeRes()
    const req = makeReq(['necessary'])
    req.user = { email: 'a@b.com', _id: 'id1' }

    await setCookieUser.call(context, req, res, jest.fn())

    expect(res.clearCookie).not.toHaveBeenCalled()
    expect(res.cookie).toHaveBeenCalledWith('synuser', expect.objectContaining({ email: 'a@b.com', id: 'id1' }), expect.any(Object))
  })
})

describe('addCookie', () => {
  test('initializes accepted to false', () => {
    // Minimal server stand-in — only what addCookie needs
    const server = { cookies: [] }
    server.addCookie = function ({ name, category, onAccepted, onRevoked }) {
      this.cookies.push({ name, category, accepted: false, onAccepted, onRevoked })
    }

    const onAccepted = jest.fn()
    server.addCookie({ name: 'analytics', category: 'analytics', onAccepted })

    expect(server.cookies).toHaveLength(1)
    expect(server.cookies[0]).toMatchObject({ name: 'analytics', category: 'analytics', accepted: false })
  })
})

describe('processCookieConsent — per-service individual control', () => {
  test('accepts a cookie when its name is listed in services for its category', async () => {
    const context = makeContext([{ name: 'Google Analytics', category: 'analytics', onAccepted: 'GA_ACCEPT' }])
    const req = makeReq(['necessary', 'analytics'], { analytics: ['Google Analytics'] })

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).toContain('GA_ACCEPT')
    expect(context.cookies[0].accepted).toBe(true)
  })

  test('does not accept a cookie whose name is absent from services even if category is accepted', async () => {
    const context = makeContext([{ name: 'Mixpanel', category: 'analytics', onAccepted: 'MIXPANEL_ACCEPT' }])
    const req = makeReq(['necessary', 'analytics'], { analytics: ['Google Analytics'] })

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).not.toContain('MIXPANEL_ACCEPT')
    expect(context.cookies[0].accepted).toBe(false)
  })

  test('two cookies in same category toggle independently via services', async () => {
    const context = makeContext([
      { name: 'Google Analytics', category: 'analytics', onAccepted: 'GA_ACCEPT' },
      { name: 'Mixpanel', category: 'analytics', onRevoked: 'MIXPANEL_REVOKE' },
    ])
    // Only Google Analytics is listed in services
    const req = makeReq(['necessary', 'analytics'], { analytics: ['Google Analytics'] })

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).toEqual(expect.arrayContaining(['GA_ACCEPT', 'MIXPANEL_REVOKE']))
    expect(context.cookies[0].accepted).toBe(true)
    expect(context.cookies[1].accepted).toBe(false)
  })

  test('falls back to category-level check when no services are listed for a category', async () => {
    const context = makeContext([{ name: 'Google Analytics', category: 'analytics', onAccepted: 'GA_ACCEPT' }])
    // category accepted, but no services object
    const req = makeReq(['necessary', 'analytics'])

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(req.reactProps.cookieScripts).toContain('GA_ACCEPT')
  })
})
