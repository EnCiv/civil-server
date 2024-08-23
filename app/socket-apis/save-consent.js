'use strict'

import Consent from '../models/consent'

async function saveConsent(formattedConsentData, cb = () => {}) {
  // Check if the consent already exists
  let whoData = {}
  let created = false

  if (this.synuser && this.synuser.id) {
    whoData[`userId`] = this.synuser.id
  }

  if (this.req) {
    whoData['ipAddress'] = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  }

  // Must have either a user ID or IP address
  if (Object.keys(whoData).length == 0) return cb(undefined)

  const prefixedData = Object.fromEntries(Object.entries(whoData).map(([key, value]) => [`who.${key}`, value]))
  let consentDoc = await Consent.findOne(prefixedData)

  // Create the doc is it doesn't already exist
  if (!consentDoc) {
    await Consent.create({ who: whoData, what: {} })
    created = true
  }

  await Consent.updateConsent(whoData, formattedConsentData)
  return cb({ created: created })
}

export default saveConsent
