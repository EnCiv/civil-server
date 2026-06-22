// github.com/EnCiv/civil-server/issues/61

https: import React, { useEffect, useState, useRef } from 'react'
import Helmet from 'react-helmet'
import * as CookieConsent from 'vanilla-cookieconsent'

const CConsentStyleHelmet = () => (
  <Helmet>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.0.1/dist/cookieconsent.css" />
  </Helmet>
)

function startAnalytics() {
  // The BrowserEnv component injects ENV selected vars from the server side to the client side.
  if (!window.process.env.GOOGLE_ANALYTICS) return
  if (document.getElementById('googletagmanager')) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function () {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', `${window.process.env.GOOGLE_ANALYTICS}`)

  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${window.process.env.GOOGLE_ANALYTICS}`
  script.id = 'googletagmanager'
  script.async = true
  document.head.appendChild(script)
  console.log('Starting analytics')
}

function stopAnalytics() {
  console.log('Stopping analytics')
  
  // Clear Google Analytics cookies for this session
  ;['_ga', '_gid', '_gat'].forEach(name => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
  })
  
  delete window.dataLayer
  delete window.gtag
  const gtmElement = document.getElementById('googletagmanager')
  if (gtmElement) gtmElement.remove()
  
  // Full opt-out requires a browser refresh to prevent GA from re-initializing and setting new cookies
  alert('Analytics has been disabled. Please refresh your browser to fully complete the opt-out.')

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

// We can extend this by storing in the database
const services = {
  necessary: [],
  analytics: [
    {
      label: 'Google Analytics',
      onAccept: () => {},
      onReject: () => {},
    },
  ],
}

/* 
Format the services data lists for each category.

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

const consentCategories = {}
// Init the services lists
for (const key of Object.keys(services)) {
  consentCategories[key] = {
    services: services[key].reduce((result, service) => {
      result[service.label] = { ...service }
      return result
    }, {}),
  }

  if (key === 'necessary') {
    consentCategories[key].readOnly = true
    consentCategories[key].enabled = true
  }
}

function EncivCookies(props) {
  const [cookie, setCookie] = useState()
  const hasMounted = useRef(false)

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

    if (categories.includes('analytics')) startAnalytics()
    else stopAnalytics()
  }, [cookie])

  useEffect(() => {
    CookieConsent.run({
      onFirstConsent: cookie => {
        setCookie(cookie)
      },
      onChange: cookie => {
        setCookie(cookie)
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

    // Apply existing saved consent on first load for returning users.
    setCookie(CookieConsent.getCookie())
  }, [])

  return (
    <div>
      <CConsentStyleHelmet />
    </div>
  )
}

export default EncivCookies
