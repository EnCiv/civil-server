// Match CookieConsent's default and share the value with its configuration.
export const COOKIE_PREFERENCES_EXPIRY_DAYS = 182

// Informational only: CookieConsent manages this cookie in the browser.
export default {
  name: 'Cookie preferences (cc_cookie)',
  category: 'necessary',
  description:
    'This cookie remembers your cookie choices, including which optional cookies you accept or reject, so we can apply your preferences when you return. ' +
    `It expires after ${COOKIE_PREFERENCES_EXPIRY_DAYS} days.`,
}
