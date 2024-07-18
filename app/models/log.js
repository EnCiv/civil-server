'use strict'
const { Mongo, Collection } = require('@enciv/mongo-collections')
const publicConfig = require('../../public.json')

// DON'T USE LOGGER IN THIS FILE - it will create a loop

class Log extends Collection {
  static collectionName = 'logs'
  static collectionOptions = {
    capped: true,
    size: publicConfig.MongoLogsCappedSize,
  }
  static async create(obj) {
    try {
      if (!Mongo.dbs['default']) {
        console.error('Log: create before db is ready, discarding', obj)
        return
      }
      const result = await this.insertOne(obj)
      if (result.acknowledged) return { ...obj, _id: result.insertedId }
      else {
        console.error(`Log.create unexpected number of results received ${results.length}`)
        return // if there's an error just keep
      }
    } catch (err) {
      console.error(`Log.create caught error:`, err)
      return // if there's an error just keep going - an example was when trying to stringify an object that had '.' in one of the keys - an error was through. We can't log it but we don't wait to crash the server
    }
  }
}

Log.setCollectionProps()

module.exports = Log
