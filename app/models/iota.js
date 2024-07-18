'use strict'
const Joi = require('@hapi/joi')
const { Collection } = require('@enciv/mongo-collections')

const schema = Joi.object({
  _id: Joi.object(),
  path: Joi.string(),
  subject: Joi.string().required(),
  description: Joi.string().required(),
  webComponent: [Joi.string(), Joi.object()],
  participants: Joi.object(),
  component: Joi.object(),
  userId: Joi.string(),
  parentId: Joi.string(),
  bp_info: Joi.object(),
})

class Iota extends Collection {
  static collectionName = 'iotas'
  static collectionIndexes = [
    { key: { path: 1 }, name: 'path', unique: true, partialFilterExpression: { path: { $exists: true } } },
    {
      key: { parentId: 1, 'component.component': 1, _id: -1 },
      name: 'children',
      partialFilterExpression: { parentId: { $exists: true }, 'component.component': { $exists: true } },
    },
  ]
  static validate(doc) {
    return schema.validate(doc)
  }
  static async create(obj) {
    try {
      const doc = new Iota(obj)
      const result = await this.insertOne(doc)
      if (result.acknowledged) return { ...doc, _id: result.insertedId }
      else {
        const msg = `unexpected result ${JSON.stringify(result, null, 2)}`
        logger.error(msg)
        throw new Error(msg)
      }
    } catch (err) {
      logger.error(`Iota.create caught error:`, err)
      throw err
    }
  }
}

Iota.setCollectionProps()

module.exports = Iota
