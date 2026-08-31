'use strict'
const Joi = require('@hapi/joi')
const { Collection } = require('@enciv/mongo-collections')

/*
The schema contains GDPR data detailing who has consented, and what they've consented to.

Consent = {
    who: { 
        userId = USER_ID, // must have at least one of these 
        ipAddress: IP_ADDRESS
    },
    what: {
      OPTION1: {
        isGranted: true,
        consentDate: DATE1,
        terms: "This is a term you've agreed to."
        history: [{
         ...previous data
        }]
      },
      OPTION2: {
        isGranted: false,
        consentDate: DATE2,
        terms: "This is a term you've agreed to."
        history: []
      }

    }
}

*/

const schema = Joi.object({
  // Holds at least 1 identifier as to who the consenting user is (userId or ipAddress)
  who: Joi.object({
    userId: Joi.string().alphanum().max(99).optional(),
    ipAddress: Joi.string()
      .ip({
        version: ['ipv4', 'ipv6'],
        cidr: 'optional',
      })
      .optional(),
  })
    .or('userId', 'ipAddress')
    .min(1)
    .max(99)
    .required()
    .unknown(true)
    .pattern(Joi.string(), Joi.string().max(99)), // Ensure any unknown identifiers are below certain size
  what: Joi.object() // Holds info on what the user consented to
    .max(99)
    .default({})
    .pattern(
      // Each option holds the time of last consent/revoke
      Joi.string().max(99),
      Joi.object({
        isGranted: Joi.boolean().required(),
        terms: Joi.string().max(999).required(),
        services: Joi.array().max(99).default([]),
        consentDate: Joi.date().required(),
        history: Joi.array().default([]),
      }).max(99)
    ),
})

class Consent extends Collection {
  static collectionName = 'consents'

  static validate(doc) {
    return schema.validate(doc)
  }

  static async create(obj) {
    try {
      const doc = new Consent(obj)
      const result = await this.insertOne(doc)
      if (result.acknowledged) return { ...doc, _id: result.insertedId }
      else {
        const msg = `unexpected result ${JSON.stringify(result, null, 2)}`
        logger.error(msg)
      }
    } catch (err) {
      logger.error(`Consent.create caught error:`, err)
    }
  }

  static modifySingleConsent(consentDoc, category, isGranted, terms, services) {
    /* Updates a consent obj in memory. */
    if (consentDoc) {
      // If previous consent data exists, push it to the history
      let newHistory

      if (consentDoc.what[category]) {
        newHistory = consentDoc.what[category]['history']
        const { history, ...otherData } = consentDoc.what[category]
        newHistory.push({ ...otherData })
      }

      // Set the new value of consent option
      return {
        ...consentDoc,
        what: {
          ...consentDoc.what,
          [category]: {
            isGranted: isGranted,
            consentDate: new Date(),
            terms: terms,
            services: services,
            history: newHistory ?? [],
          },
        },
      }
    } else {
      logger.error('Consent.modifySingleConsent called without consentDoc')
      return undefined
    }
  }

  static async updateConsent(whoData, newConsent) {
    const prefixedData = Object.fromEntries(Object.entries(whoData).map(([key, value]) => [`who.${key}`, value]))
    let doc = await this.findOne(prefixedData)

    if (!doc) {
      logger.error('Consent.updateConsent: no document found for', whoData)
      return undefined
    }

    for (const obj of newConsent) {
      const { category, isGranted, terms, services } = obj

      doc = this.modifySingleConsent(doc, category, isGranted, terms, services)
    }

    const { _id, ...docWithoutId } = doc
    const { error, value } = this.validate(docWithoutId)
    if (error) {
      logger.error('Consent.updateConsent: validation failed', error)
      return undefined
    }

    const result = await this.findOneAndUpdate({ _id }, { $set: value }, { returnDocument: 'after' })
    return result.value
  }
}
Consent.setCollectionProps()

module.exports = Consent
