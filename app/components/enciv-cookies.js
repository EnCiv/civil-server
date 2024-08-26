import React, { useEffect, useState, useRef } from 'react'
import Helmet from 'helmet'
import * as CookieConsent from 'vanilla-cookieconsent'

const CConsentStyleHelmet = () => (
  <Helmet>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.0.1/dist/cookieconsent.css" />
  </Helmet>
)

function EncivCookies(props) {
  const { user } = props
  const [cookie, setCookie] = useState()
  const hasMounted = useRef(false)

  useEffect(() => {
    // Prevent this running on the initial render
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }

    const userId = user?.id || user?.tempId
    const synuser = { synuser: { id: userId } }

    const consent = CookieConsent.getCookie()

    // Retrieve information from lookups and format
    let formattedConsentData = []
    for (const category of Object.keys(modalSections)) {
      formattedConsentData.push({
        category: category,
        isGranted: consent.categories.includes(category),
        terms: modalSections[category].description,
        services: consent.services[category],
      })
    }

    // Call the server to save consent to database
    window.socket.emit('save-consent', synuser, formattedConsentData, () => {
      console.log('Consent data successfully saved.')
    })
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
  }, [])

  // The sections that show in the consent modal
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
        onAccept: () => {
          if (process.env.GOOGLE_ANALYTICS) {
            window.dataLayer = window.dataLayer || []
            window.gtag = function () {
              dataLayer.push(arguments)
            }
            gtag('js', new Date())
            gtag('config', `${process.env.GOOGLE_ANALYTICS}`)
            const script = document.createElement('script') // create a script DOM node
            script.src = `https://www.googletagmanager.com/gtag/js?id=${process.env.GOOGLE_ANALYTICS}`
            script.id = 'googletagmanager' // so we can find it and delete it if needed
            document.head.appendChild(script)
          }
        },
        onReject: () => {
          delete window.dataLayer
          delete window.gtag
          const gtmElement = document.getElementById('googletagmanager')
          if (gtmElement) gtmElement.remove()
        },
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

  return (
    <div>
      <CConsentStyleHelmet />
    </div>
  )
}

export default EncivCookies
