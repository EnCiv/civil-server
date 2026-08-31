// github.com/EnCiv/civil-server/issues/61

import React, { useEffect, useState, useRef } from 'react'
import { Helmet } from 'react-helmet'
import * as CookieConsent from 'vanilla-cookieconsent'
export default EncivCookies

// scripts (acceptedScript/revokedScript from server.addCookie) only need to run once, on the server render.
const CConsentStyleHelmet = ({ scripts }) => (
  <Helmet
    script={
      typeof window === 'undefined' && Array.isArray(scripts) && scripts.length
        ? [{ type: 'text/javascript', innerHTML: scripts.join('\n') }]
        : []
    }
  >
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.0.1/dist/cookieconsent.css" />
  </Helmet>
)

// Runs a registered cookie's onAccepted/onRevoked source string (see server.addCookie) the same way
// the server-rendered Helmet <script> does, so live consent changes don't need duplicate hardcoded logic.
function runCookieScript(script) {
  if (!script) return
  const el = document.createElement('script')
  el.text = script
  document.head.appendChild(el)
  el.remove()
}

function isCookieAccepted(categories, services, category, name) {
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
      'These cookies collect information about how you use our website. All of the data is anonymized and cannot be used to identify you.',
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
function buildConsentCategories(cookieCategories) {
  // Group the registered cookies by category
  const services = { necessary: [] }
  for (const { name, category } of cookieCategories || []) {
    if (!services[category]) services[category] = []
    services[category].push({
      label: name,
      onAccept: () => {},
      onReject: () => {},
    })
  }

  const consentCategories = {}
  // Init the services lists - one section per category defined in modalSections
  for (const key of Object.keys(modalSections)) {
    consentCategories[key] = {
      services: (services[key] || []).reduce((result, service) => {
        result[service.label] = { ...service }
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
  const hasMounted = useRef(false)
  const consentCategories = buildConsentCategories(props.cookieCategories)

  useEffect(() => {
    // Prevent this running on the initial render
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }

    const consent = CookieConsent.getCookie() || {}
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
    window.socket.emit('save-consent', formattedConsentData, () => {
      console.log('Consent data successfully saved.')
    })

    for (const { name, category, onAccepted, onRevoked } of props.cookieCategories || []) {
      runCookieScript(isCookieAccepted(categories, consentServices, category, name) ? onAccepted : onRevoked)
    }
  }, [cookie])

  useEffect(() => {
    CookieConsent.run({
      onFirstConsent: cookie => {
        setCookie(cookie)
      },
      onChange: cookie => {
        setCookie(cookie)
      },
      onConsent: ({ cookie }) => {
        // Fires once run() has fully initialized (first consent action and every page load) -
        // calling CookieConsent.getCookie() right after run() races the library's own init.
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
                    'For any queries in relation to my policy on cookies and your choices, please <a href="#contact-page">contact us</a>',
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
      <CConsentStyleHelmet scripts={props.cookieScripts} />
    </div>
  )
}

