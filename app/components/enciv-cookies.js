// github.com/EnCiv/civil-server/issues/61

import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import * as CookieConsent from 'vanilla-cookieconsent'
import { COOKIE_PREFERENCES_EXPIRY_DAYS } from '../lib/cookie-preferences-cookie'
export default EncivCookies

const CConsentStyleHelmet = () => (
  <Helmet>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.0.1/dist/cookieconsent.css" />
    <style>{`
      #cc-main .pm__service { align-items: flex-start; padding-top: .8em; padding-bottom: .8em; }
      #cc-main .pm__service-header { align-items: flex-start; }
      #cc-main .pm__service-icon { margin-top: .45em; }
      #cc-main .toggle-service { flex-shrink: 0; margin-top: .2em; }
      #cc-main .enciv-cookie-description { display: block; margin-top: .4em; font-weight: normal; line-height: 1.5; }
    `}</style>
  </Helmet>
)

function isCookieAccepted(categories, services, category, name) {
  if (category === 'necessary') return true
  const categoryServices = services[category]
  return Array.isArray(categoryServices) ? categoryServices.includes(name) : categories.includes(category)
}

// Static consent configuration — independent of component state
const modalSections = {
  necessary: {
    title: 'Strictly Necessary cookies',
    description: 'These cookies are essential for the proper functioning of the website and cannot be disabled.',

    //this field will generate a toggle linked to the 'necessary' category
    linkedCategory: 'necessary',
  },
  analytics: {
    title: 'Performance and Analytics',
    description:
      'These optional cookies help us understand how visitors use our website so we can improve it.',
    linkedCategory: 'analytics',
  },
}

/* 
Build the services data lists for each category from the server's registered cookie list
(props.cookieCategories - populated server-side via server.addCookie({ name, category, onAccepted, onRevoked })
and passed down through reactProps/set-user-cookie.js), instead of hardcoding them here.

Was a bit hard to find documentation, 
but this is the object structure for displaying individual services.
{
    service1: {
      label: 'service1',
      onAccept: Func(),
      onReject: Func(),  
    },
    service2: {...}
    ...
}
*/
// Service labels support HTML; names and descriptions remain plain-text metadata.
const escapeHtml = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

function buildConsentCategories(cookieCategories) {
  // Group the registered cookies by category
  const services = { necessary: [] }
  for (const { name, category, description, privacyUrl } of cookieCategories || []) {
    if (!services[category]) services[category] = []
    services[category].push({
      name,
      label: escapeHtml(name) + (description ? `<span class="enciv-cookie-description">${escapeHtml(description)}${privacyUrl && /^https:\/\//i.test(privacyUrl)
        ? ` <a href="${escapeHtml(privacyUrl)}" target="_blank" rel="noopener noreferrer">Learn how your information is used</a>.`
        : ''}</span>` : ''),
      onAccept: () => {},
      onReject: () => {},
    })
  }

  const consentCategories = {}
  // Init the services lists - one section per category defined in modalSections
  for (const key of Object.keys(modalSections)) {
    consentCategories[key] = {
      services: (services[key] || []).reduce((result, service) => {
        const { name, ...config } = service
        result[name] = config
        return result
      }, {}),
    }

    if (key === 'necessary') {
      consentCategories[key].readOnly = true
      consentCategories[key].enabled = true
    }
  }
  return consentCategories
}

function EncivCookies(props) {
  const [cookie, setCookie] = useState()
  const consentCategories = buildConsentCategories(props.cookieCategories)
  // Persists an actual consent action (first choice or a later change) and runs the
  // matching accepted/revoked scripts. Must NOT be called from onConsent, which also
  // fires on every page load with the existing, unchanged cookie.
  function persistConsent(cookie) {
    const consent = cookie || {}
    const categories = Array.isArray(consent.categories) ? consent.categories : []
    const consentServices = consent.services || {}

    // Retrieve information from lookups and format
    let formattedConsentData = []
    for (const category of Object.keys(modalSections)) {
      formattedConsentData.push({
        category: category,
        isGranted: categories.includes(category),
        terms: modalSections[category].description,
        services: consentServices[category],
      })
    }

    // Call the server to save consent to database
    // KNOWN LIMITATION: on pages with no real socket (NO_SOCKET_IO, cc2020, undebate-stage1),
    // window.socket is the NoSocket stub and this emit is a no-op, so consent isn't persisted there.
    // Accepted for now since those are legacy pages - worst case is re-prompting the user later.
    window.socket.emit('save-consent', formattedConsentData, () => {
      console.log('Consent data successfully saved.')
    })

    for (const { id, name, category } of props.cookieCategories || []) {
      const handlers = window.encivCookieHandlers?.[id]
      const callback = isCookieAccepted(categories, consentServices, category, name) ? handlers?.onAccepted : handlers?.onRevoked
      callback?.()
    }
  }

  useEffect(() => {
    CookieConsent.run({
      cookie: { expiresAfterDays: COOKIE_PREFERENCES_EXPIRY_DAYS },
      onFirstConsent: ({ cookie }) => {
        setCookie(cookie)
        persistConsent(cookie)
      },
      onChange: ({ cookie }) => {
        setCookie(cookie)
        persistConsent(cookie)
      },
      onConsent: ({ cookie }) => {
        // Fires once run() has fully initialized (first consent action and every page load) -
        // calling CookieConsent.getCookie() right after run() races the library's own init.
        // Only update local state here for rendering/debug - do not persist, since this also
        // fires on plain page loads with no new user choice.
        setCookie(cookie)

        // DEBUG: log every registered cookie and whether it's currently enabled/disabled (dev only).
        if (window.process && window.process.env && window.process.env.NODE_ENV === 'development') {
          const consentCategories = (cookie && cookie.categories) || []
          const consentServices = (cookie && cookie.services) || {}
          console.log(
            'EncivCookies debug - cookie status on load:',
            (props.cookieCategories || []).map(({ name, category }) => ({
              name,
              category,
              enabled: isCookieAccepted(consentCategories, consentServices, category, name),
            }))
          )
        }
      },
      categories: consentCategories,
      language: {
        default: 'en',
        translations: {
          en: {
            consentModal: {
              title: 'We use cookies',
              description: 'Cookie modal description',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Reject all',
              showPreferencesBtn: 'Manage Individual preferences',
            },
            preferencesModal: {
              title: 'Manage cookie preferences',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Reject all',
              savePreferencesBtn: 'Accept current selection',
              closeIconLabel: 'Close modal',
              sections: [
                ...Object.values(modalSections),
                {
                  title: 'More information',
                  description:
                    'For any questions about our cookie policy and your choices, please contact us at <a href="mailto:contact@enciv.org">contact@enciv.org</a>.',
                },
              ],
            },
          },
        },
      },
    })
  }, [])

  return (
    <div>
      <CConsentStyleHelmet />
    </div>
  )
}
