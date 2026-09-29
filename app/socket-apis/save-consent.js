'use strict'

import Consent from '../models/consent'

async function saveConsent(formattedConsentData, cb = () => {}) {
  /* 
  Formatted consent data is a list of objects with these fields:
    [
      {
        category: 'OptionName',
        isGranted: false,
        terms: 'Some text..',
      },
    ],
  */
  // Check if the consent already exists
  let whoData = {}
  const socketUserId = this?.synuser?.id

  // Authenticated users are identified solely by userId - the socket's remoteAddress is
  // also always present, and including both would AND-match on the current IP, missing
  // the user's existing consent doc whenever they connect from a different address.
  if (socketUserId) {
    whoData.userId = socketUserId
  } else {
    // On proxied deployments, the raw transport address is the reverse proxy's, not the
    // client's - prefer x-forwarded-for (set by our trusted proxy) the same way the HTTP
    // path resolves it in app/routes/get-iota.js, falling back to the raw address otherwise.
    const forwardedFor = this?.handshake?.headers?.['x-forwarded-for']
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : this?.client?.conn?.remoteAddress
    if (ipAddress) whoData.ipAddress = ipAddress
  }

  // Must have either a user ID or IP address
  if (Object.keys(whoData).length === 0) return cb(undefined)
  const prefixedData = Object.fromEntries(Object.entries(whoData).map(([key, value]) => [`who.${key}`, value]))

  try {
    let consentDoc = await Consent.findOne(prefixedData)

    if (!consentDoc) {
      // No existing doc — build the full document in memory and create it in one operation
      let newDoc = { who: whoData, what: {} }
      for (const { category, isGranted, terms, services } of formattedConsentData) {
        newDoc = Consent.modifySingleConsent(newDoc, category, isGranted, terms, services)
      }
      const result = await Consent.create(newDoc)
      if (!result) return cb(undefined)
      return cb({ created: true })
    }

    const updatedDoc = await Consent.updateConsent(whoData, formattedConsentData)
    if (!updatedDoc) return cb(undefined)

    return cb({ created: false })
  } catch (err) {
    logger.error('saveConsent caught error:', err)
    return cb(undefined)
  }
}

export default saveConsent
