'use strict'
const Joi = require('@hapi/joi')
const { Collection } = require('@enciv/mongo-collections')
const bcrypt = require('bcrypt')
const { randomString } = require('../lib/random-string')
const { base64url } = require('../lib/base64url')

const schema = Joi.object({
  _id: Joi.object(),
  name: Joi.string(),
  email: Joi.string().email(),
  password: Joi.string(),
  firstName: Joi.string(),
  lastName: Joi.string(),
  activationToken: Joi.string().optional().allow(''),
  activationKey: Joi.string().optional().allow(''),
  tokenExpirationDate: Joi.date().optional().allow(''),
})

const TOKEN_EXPIRATION_TIME_MINUTES = 10

class User extends Collection {
  static collectionName = 'users' // the mongodb collection name
  static collectionIndexes = [
    {
      key: { email: 1 },
      name: 'email',
      unique: true,
      partialFilterExpression: { email: { $exists: true } },
    },
  ]

  static validate(doc) {
    return schema.validate(doc)
  }

  static async create(user) {
    var error
    const { password, email, name } = user
    // email is not required if creating temp it -- if (!email) error = `User.create attempted, but no email. name=${name}`
    if (!password) {
      error = `User.create attempted, but no password. name=${name}, email=${email}`
      logger.error(error)
      throw new Error(error)
    } else {
      try {
        const hash = await bcrypt.hash(password, 10)
        user.password = hash
        const doc = new User(user)
        try {
          const result = await this.insertOne(doc)
          if (result.acknowledged) {
            doc._id = result.insertedId
            return doc
          } else {
            const msg = `unexpected result ${JSON.stringify(result, null, 2)}`
            logger.error(msg)
            throw new Error(msg)
          }
        } catch (err) {
          throw err
        }
      } catch (err) {
        logger.error((error = `User password encryption failed ${err}`))
        throw new Error(error)
      }
    }
  }

  static async validatePassword(doc, plainTextPassword) {
    try {
      const res = await bcrypt.compare(plainTextPassword, doc.password)
      return res
    } catch (err) {
      const msg = `bcrypt compare error: ${err}`
      logger.info(msg)
      throw new Error(msg)
    }
  }

  static async generateTokenAndKey(doc) {
    await User.updateOne(
      { _id: doc._id },
      {
        $set: {
          activationKey: base64url(randomString(12)),
          activationToken: base64url(randomString(12)),
          tokenExpirationDate: new Date(),
        },
      }
    ).catch(err => {
      logger.error('failed trying to reactivate user', err, doc)
      throw err
    })
    const result = await User.findOne({ _id: doc._id })
    return result
  }

  static async resetPassword(activationToken, activationKey, newPassword) {
    const user = await User.findOne({ activationToken, activationKey })
    if (!user) throw new Error('resetPassword - user not found')
    if (!user.tokenExpirationDate) throw new Error('resetPassword - tokenExpirationDate missin')
    const tokenExpirationTime = new Date(user.tokenExpirationDate).getTime() + TOKEN_EXPIRATION_TIME_MINUTES * 60 * 1000
    if (tokenExpirationTime < new Date().getTime()) {
      throw new Error('token expired')
    }
    const hash = await bcrypt.hash(newPassword, 10)
    await User.updateOne(
      { activationKey, activationToken },
      {
        $set: {
          password: hash,
          activationKey: '',
          activationToken: '',
          tokenExpirationDate: '',
        },
      }
    )
  }
}

User.setCollectionProps()

module.exports = User
