'use strict'
const Joi = require('@hapi/joi')
const { Mongo, Collection } = require('@enciv/mongo-collections')
const { ObjectId } = require('mongodb')

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
      OPTION1: {
        isGranted: false,
        consentDate: DATE2,
        term: "This is a term you've agreed to."
        history: []
      }

    }
}

*/

const schema = Joi.object({
  // Holds at least 1 identifier as to who the consenting user is
  who: Joi.object({
    userId: Joi.string().alphanum().max(99).optional(),
    ipAddress: Joi.string()
      .ip({
        version: ['ipv4', 'ipv6'],
        cidr: 'optional',
      })
      .optional()
      .allow(''),
  })
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
        throw new Error(msg)
      }
    } catch (err) {
      logger.error(`Consent.create caught error:`, err)
      throw err
    }
  }

  static async updateConsent(consentObj, optionName, consentGranted, terms) {
    // Use the provided consent object to construct the query
    const query = { _id: consentObj._id } // Assuming the document has an _id field
    const consentDoc = await this.findOne(query)

    if (consentDoc) {
      // If previous consent data exists, push it to the history
      let newHistory

      if (consentDoc.what[optionName]) {
        newHistory = consentDoc.what[optionName]['history']
        const { history, ...otherData } = consentDoc.what[optionName]
        newHistory.push({ ...otherData })
      }

      // Set the new value of consent option
      const newConsent = {
        ...consentDoc.what,
        [optionName]: { isGranted: consentGranted, consentDate: new Date(), terms: terms, history: newHistory ?? [] },
      }

      await this.updateOne(query, { $set: { what: newConsent } })

      return await this.findOne(query)
    } else {
      console.log('No matching document found.')
    }
  }
}
Consent.setCollectionProps()

module.exports = Consent
