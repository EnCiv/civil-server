'use strict'

const COOKIE = {
  path: '/',
  signed: false,
  maxAge: 1209600000,
  httpOnly: true,
}

// cookie-consent helpers were removed; the synuser cookie is strictly necessary and is not gated behind consent

// Collects the onAccepted/onRevoked script matching this request's current consent for CConsentStyleHelmet to render.
// must be called with 'this' of the server
function processCookieConsent(req, cookies) {
  const consent = parseConsentCookie(req.cookies && req.cookies.cc_cookie)
  const categories = (consent && Array.isArray(consent.categories) && consent.categories) || []
  const services = (consent && consent.services) || {}
  const scripts = []

  for (const cookie of cookies) {
    const categoryServices = services[cookie.category]
    const isAccepted = Array.isArray(categoryServices)
      ? categoryServices.includes(cookie.name)
      : categories.includes(cookie.category)

    const script = isAccepted ? cookie.onAccepted : cookie.onRevoked
    if (script) scripts.push(script)
  }

  return scripts
}

// Includes onAccepted/onRevoked (plain developer-authored source strings, not derived from user input) so
// the client can re-run the matching script itself when consent changes live, instead of duplicating logic.
function getCookieCategories(cookies) {
  return cookies.map(({ name, category, onAccepted, onRevoked }) => ({ name, category, onAccepted, onRevoked }))
}

// must be called with 'this' of the server
async function setCookieUser(req, res, next) {
  var cookie

  const cookieScripts = processCookieConsent(req, this.cookies)


  // Expose the server's registered cookie/category list to the client via reactProps (same pattern as get-iota.js),
  // so enciv-cookies.js can build its consent modal from real data instead of hardcoding it.
  if (req.reactProps) Object.assign(req.reactProps, { cookieCategories: getCookieCategories(this.cookies), cookieScripts })
  else req.reactProps = { cookieCategories: getCookieCategories(this.cookies), cookieScripts }


  if (!hasRequiredCookieConsent(req)) {
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
