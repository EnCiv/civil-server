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

  if (socketUserId) whoData.userId = socketUserId

  if (this?.client?.conn?.remoteAddress) {
    whoData['ipAddress'] = this.client.conn.remoteAddress
  }

  // Must have either a user ID or IP address
  if (Object.keys(whoData).length === 0) return cb(undefined)
  const prefixedData = Object.fromEntries(Object.entries(whoData).map(([key, value]) => [`who.${key}`, value]))

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
