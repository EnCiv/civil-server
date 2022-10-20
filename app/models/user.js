'use strict'
const Joi = require('@hapi/joi')
const MongoModels = require('mongo-models')
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
  activationToken: Joi.string().optional().allow(null),
  activationKey: Joi.string().optional().allow(null),
  tokenExpirationDate: Joi.date().optional().allow(null),
})

const TOKEN_EXPIRATION_TIME_MINUTES = 10

class User extends MongoModels {
  static create(user) {
    return new Promise(async (ok, ko) => {
      var error
      const { password, email, name } = user
      // email is not required if creating temp it -- if (!email) error = `User.create attempted, but no email. name=${name}`
      if (!password) error = `User.create attempted, but no password. name=${name}, email=${email}`
      if (password) {
        bcrypt.hash(password, 10, async (err, hash) => {
          if (err) {
            logger.error((error = `User password encryption failed ${err}`))
            ko(new Error(error))
          } else {
            user.password = hash
            const doc = new User(user)
            try {
              const result = await this.insertOne(doc)
              if (result && result.length === 1) ok(result[0])
              else {
                logger.error((error = `unexpected number of results received ${results.length}`))
                ko(new Error(error))
              }
            } catch (err) {
              ko(err)
            }
          }
        })
        return // let bcrypt do its thing
      }
      logger.error(error)
      ko(new Error(error))
    })
  }

  validatePassword(plainTextPassword) {
    return new Promise((ok, ko) => {
      bcrypt.compare(plainTextPassword, this.password, (err, res) => {
        if (err) {
          logger.error('User.validatePassword returned error:', err)
          ko(newError(err))
        } else {
          ok(res)
        }
      })
    })
  }

  async generateTokenAndKey() {
    await User.updateOne(
      { _id: this._id },
      {
        $set: {
          activationKey: base64url(randomString(12)),
          activationToken: base64url(randomString(12)),
          tokenExpirationDate: new Date(),
        },
      }
    ).catch(err => {
      logger.error('failed trying to reactivate user', err, this)
      throw err
    })
    return await User.findById(this._id)
  }

  static async resetPassword(activationToken, activationKey, newPassword) {
    await User.findOne({ activationToken, activationKey }).then(user => {
      const tokenExpirationTime = new Date(
        user.tokenExpirationDate.getTime() + TOKEN_EXPIRATION_TIME_MINUTES * 60 * 1000
      )
      if (tokenExpirationTime.getTime() < new Date().getTime()) {
        throw new Error('token expired')
      }
    })
    const hash = bcrypt.hashSync(newPassword, 10)
    await User.updateOne(
      { activationKey, activationToken },
      {
        $set: {
          password: hash,
          activationKey: null,
          activationToken: null,
          tokenExpirationDate: null,
        },
      }
    )
  }
}

User.collectionName = 'users' // the mongodb collection name
User.schema = schema

function init() {
  return new Promise(async (ok, ko) => {
    try {
      await User.createIndexes([
        {
          key: { email: 1 },
          name: 'email',
          unique: true,
          partialFilterExpression: { email: { $exists: true } },
        },
      ])
      return ok()
    } catch (err) {
      logger.error('User.createIndexes error:', err)
      return ko(err)
    }
  })
}

if (MongoModels.dbs['default']) init()
else if (MongoModels.toInit) MongoModels.toInit.push(init)
else MongoModels.toInit = [init]

module.exports = User
