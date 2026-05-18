'use strict'

const COOKIE = {
  path: '/',
  signed: false,
  maxAge: 1209600000,
  httpOnly: true,
}

function parseConsentCookie(consentCookie) {
  if (!consentCookie) return undefined
  if (typeof consentCookie === 'object') return consentCookie

  try {
    return JSON.parse(consentCookie)
  } catch (error) {
    try {
      return JSON.parse(decodeURIComponent(consentCookie))
    } catch (err) {
      return undefined
    }
  }
}

function hasAcceptedConsent(req) {
  const consent = parseConsentCookie(req.cookies && req.cookies.cc_cookie)
  return !!(consent && Array.isArray(consent.categories) && consent.categories.includes('analytics'))
}

// must be called with 'this' of the server
async function setCookieUser(req, res, next) {
  var cookie

  if (!hasAcceptedConsent(req)) {
    res.clearCookie('synuser')
    next()
    return
  }

  if (req.user) {
    cookie = { email: req.user.email, id: req.user._id, tempid: req.tempid } // the temp id is passed in the req from the temp-id route
    if (req.user.assignmentId) cookie.assignmentId = req.user.assignmentId
    res.cookie('synuser', cookie, COOKIE)
    next()
  } else if (req.cookies.synuser) {
    cookie = Object.assign(req.cookies.synuser) // just copy the old user info so we can extend the maxAge
    this.socketAPI.validateUserCookie(
      cookie,
      () => {
        /// ok
        cookie = Object.assign(req.cookies.synuser) // just copy the old user info so we can extend the maxAge
        res.cookie('synuser', cookie, COOKIE)
        next()
      },
      () => {
        // ko
        res.clearCookie('synuser')
        next(new Error(`setUserCookie: user id ${req.cookies.synuser.id} not found in this server/db`))
      }
    )
  } else {
    res.clearCookie('synuser')
    next()
  }
}

export default setCookieUser
