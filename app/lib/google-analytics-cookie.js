// Callbacks run in the browser after addCookie serializes them; keep them self-contained.
const GoogleAnalyticsCookie = {
  name: 'Google Analytics',
  category: 'analytics',
  description:
    'Google Analytics cookies (_ga and _ga_*) help us understand how visitors use our website so we can improve it. ' +
    'They distinguish visitors and maintain session information. Google lists a default expiry of two years; the actual expiry may be shorter depending on our settings and your browser.',
  privacyUrl: 'https://policies.google.com/technologies/partner-sites',
  onAccepted: function () {
    if (!window.process || !window.process.env || !window.process.env.GOOGLE_ANALYTICS) return
    window['ga-disable-' + window.process.env.GOOGLE_ANALYTICS] = false
    if (document.getElementById('googletagmanager')) return
    window.dataLayer = window.dataLayer || []
    window.gtag = function () {
      window.dataLayer.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', window.process.env.GOOGLE_ANALYTICS)
    const script = document.createElement('script')
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + window.process.env.GOOGLE_ANALYTICS
    script.id = 'googletagmanager'
    script.async = true
    document.head.appendChild(script)
  },
  onRevoked: function () {
    // GA's own opt-out switch - stops gtag.js from sending hits even if a stray reference
    // to the old gtag function survives somewhere outside window.gtag.
    if (window.process && window.process.env && window.process.env.GOOGLE_ANALYTICS) {
      window['ga-disable-' + window.process.env.GOOGLE_ANALYTICS] = true
    }

    // Detect whether gtag.js was actually loaded/running on this page (a live revocation),
    // as opposed to this running on a fresh page load where consent was already revoked.
    const wasActive = !!(window.gtag || document.getElementById('googletagmanager'))

    // GA/GTM cookie names carry dynamic per-property suffixes (_ga_<container-id>, _gat_<property>,
    // _dc_gtm_<property>) and may be set on the parent domain, not just the current host - so
    // enumerate actual cookies by prefix and expire them across the domain variants GA uses.
    const gaCookiePattern = /^_ga|^_gid|^_gat|^_dc_gtm_/
    const hostnameParts = window.location.hostname.split('.')
    const domains = [undefined, window.location.hostname, '.' + window.location.hostname]
    if (hostnameParts.length > 2) {
      const parentDomain = hostnameParts.slice(-2).join('.')
      domains.push(parentDomain, '.' + parentDomain)
    }
    document.cookie.split(';').forEach(function (cookieStr) {
      const name = cookieStr.split('=')[0].trim()
      if (!gaCookiePattern.test(name)) return
      domains.forEach(function (domain) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;' + (domain ? ' domain=' + domain + ';' : '')
      })
    })
    delete window.dataLayer
    delete window.gtag
    const gtmElement = document.getElementById('googletagmanager')
    if (gtmElement) gtmElement.remove()

    // Removing the script tag/globals doesn't stop gtag.js's already-registered listeners/timers -
    // only a reload guarantees it actually stops, and only a live revocation needs one.
    if (wasActive) window.location.reload()
  },
}

export default GoogleAnalyticsCookie
