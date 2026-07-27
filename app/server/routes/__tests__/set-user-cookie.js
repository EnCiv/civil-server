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
  test('calls onAccepted when category transitions from not-accepted to accepted', async () => {
    const onAccepted = jest.fn()
    const context = makeContext([{ name: 'analytics', category: 'analytics', accepted: false, onAccepted }])

    await setCookieUser.call(context, makeReq(['necessary', 'analytics']), makeRes(), jest.fn())

    expect(onAccepted).toHaveBeenCalledTimes(1)
    expect(context.cookies[0].accepted).toBe(true)
  })

  test('does not call onAccepted again when category is already accepted', async () => {
    const onAccepted = jest.fn()
    const context = makeContext([{ name: 'analytics', category: 'analytics', accepted: true, onAccepted }])

    await setCookieUser.call(context, makeReq(['necessary', 'analytics']), makeRes(), jest.fn())

    expect(onAccepted).not.toHaveBeenCalled()
  })

  test('calls onRevoked when category transitions from accepted to not-accepted', async () => {
    const onRevoked = jest.fn()
    const context = makeContext([{ name: 'analytics', category: 'analytics', accepted: true, onRevoked }])

    await setCookieUser.call(context, makeReq(['necessary']), makeRes(), jest.fn())

    expect(onRevoked).toHaveBeenCalledTimes(1)
    expect(context.cookies[0].accepted).toBe(false)
  })

  test('does not call onRevoked when category was never accepted', async () => {
    const onRevoked = jest.fn()
    const context = makeContext([{ name: 'analytics', category: 'analytics', accepted: false, onRevoked }])

    await setCookieUser.call(context, makeReq(['necessary']), makeRes(), jest.fn())

    expect(onRevoked).not.toHaveBeenCalled()
  })

  test('does not call onAccepted when no consent cookie is present', async () => {
    const onAccepted = jest.fn()
    const context = makeContext([{ name: 'analytics', category: 'analytics', accepted: false, onAccepted }])

    await setCookieUser.call(context, makeReq(null), makeRes(), jest.fn())

    expect(onAccepted).not.toHaveBeenCalled()
  })

  test('handles multiple cookies across different categories independently', async () => {
    const onAcceptedAnalytics = jest.fn()
    const onRevokedMarketing = jest.fn()
    const context = makeContext([
      { name: 'ga', category: 'analytics', accepted: false, onAccepted: onAcceptedAnalytics },
      { name: 'ads', category: 'marketing', accepted: true, onRevoked: onRevokedMarketing },
    ])

    // analytics accepted, marketing revoked
    await setCookieUser.call(context, makeReq(['necessary', 'analytics']), makeRes(), jest.fn())

    expect(onAcceptedAnalytics).toHaveBeenCalledTimes(1)
    expect(context.cookies[0].accepted).toBe(true)
    expect(onRevokedMarketing).toHaveBeenCalledTimes(1)
    expect(context.cookies[1].accepted).toBe(false)
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
    const onAccepted = jest.fn()
    const context = makeContext([{ name: 'Google Analytics', category: 'analytics', accepted: false, onAccepted }])
    const req = makeReq(['necessary', 'analytics'], { analytics: ['Google Analytics'] })

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(onAccepted).toHaveBeenCalledTimes(1)
    expect(context.cookies[0].accepted).toBe(true)
  })

  test('does not accept a cookie whose name is absent from services even if category is accepted', async () => {
    const onAccepted = jest.fn()
    const context = makeContext([{ name: 'Mixpanel', category: 'analytics', accepted: false, onAccepted }])
    const req = makeReq(['necessary', 'analytics'], { analytics: ['Google Analytics'] })

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(onAccepted).not.toHaveBeenCalled()
    expect(context.cookies[0].accepted).toBe(false)
  })

  test('two cookies in same category toggle independently via services', async () => {
    const onAcceptedGA = jest.fn()
    const onRevokedMixpanel = jest.fn()
    const context = makeContext([
      { name: 'Google Analytics', category: 'analytics', accepted: false, onAccepted: onAcceptedGA },
      { name: 'Mixpanel', category: 'analytics', accepted: true, onRevoked: onRevokedMixpanel },
    ])
    // Only Google Analytics is listed in services
    const req = makeReq(['necessary', 'analytics'], { analytics: ['Google Analytics'] })

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(onAcceptedGA).toHaveBeenCalledTimes(1)
    expect(context.cookies[0].accepted).toBe(true)
    expect(onRevokedMixpanel).toHaveBeenCalledTimes(1)
    expect(context.cookies[1].accepted).toBe(false)
  })

  test('falls back to category-level check when no services are listed for a category', async () => {
    const onAccepted = jest.fn()
    const context = makeContext([{ name: 'Google Analytics', category: 'analytics', accepted: false, onAccepted }])
    // category accepted, but no services object
    const req = makeReq(['necessary', 'analytics'])

    await setCookieUser.call(context, req, makeRes(), jest.fn())

    expect(onAccepted).toHaveBeenCalledTimes(1)
  })
})
