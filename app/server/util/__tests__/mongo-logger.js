'use strict'
// End-to-end test: server-side logger → mongologger appender → logs collection.
//
// Verifies that calling logger.info / logger.error causes a record to appear in
// the MongoDB logs collection with the correct level, source, data, and a
// startTime within a few seconds of when the call was made.

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { Mongo } from '@enciv/mongo-collections'
import { MongoMemoryServer } from 'mongodb-memory-server'
import log4js from 'log4js'
import mongologger from '../mongo-logger'
import Log from '../../../models/log'

// prevent Log.create from bailing out before the db is connected
if (!global.logger) global.logger = console

let MemoryServer

beforeAll(async () => {
  MemoryServer = await MongoMemoryServer.create()
  await Mongo.connect(MemoryServer.getUri())

  // Mirror the configuration in the-civil-server.js, but only with the mongo
  // appenders (no stderr) so test output stays clean.
  log4js.configure({
    appenders: {
      nodeMongoAppender: { type: mongologger, source: 'node' },
      browserMongoAppender: { type: mongologger, source: 'browser' },
    },
    categories: {
      node: { appenders: ['nodeMongoAppender'], level: 'debug' },
      browser: { appenders: ['browserMongoAppender'], level: 'debug' },
      default: { appenders: ['nodeMongoAppender'], level: 'debug' },
    },
  })

  global.logger = log4js.getLogger('node')
  global.bslogger = log4js.getLogger('browser')
})

afterAll(async () => {
  await new Promise(resolve => log4js.shutdown(resolve))
  await Mongo.disconnect()
  await MemoryServer.stop()
})

// mongologgerAppender calls Log.create() without awaiting it.
// Give the async insert a moment to land before querying.
const waitForInsert = () => new Promise(resolve => setTimeout(resolve, 200))

describe('server-side logger → mongo', () => {
  test('logger.info writes a record with the correct level, source, data, and timestamp', async () => {
    const now = new Date()
    const msg = 'server-info-test-' + Date.now()

    logger.info(msg, { detail: 'extra' })
    await waitForInsert()

    const record = await Log.findOne({ data: msg })
    expect(record).toBeDefined()
    expect(record.level).toBe('info')
    expect(record.source).toBe('node')
    // data is an array; the string message and the extra object should both be present
    expect(record.data).toContain(msg)
    expect(record.data).toContainEqual({ detail: 'extra' })
    // startTime should be a Date close to when we made the call
    expect(record.startTime).toBeInstanceOf(Date)
    expect(Math.abs(record.startTime - now)).toBeLessThan(3000)
  })

  test('logger.error writes a record with level "error"', async () => {
    const now = new Date()
    const msg = 'server-error-test-' + Date.now()

    logger.error(msg)
    await waitForInsert()

    const record = await Log.findOne({ data: msg })
    expect(record).toBeDefined()
    expect(record.level).toBe('error')
    expect(record.source).toBe('node')
    expect(record.data).toContain(msg)
    expect(record.startTime).toBeInstanceOf(Date)
    expect(Math.abs(record.startTime - now)).toBeLessThan(3000)
  })

  test('bslogger.info writes a record with source "browser"', async () => {
    const now = new Date()
    const msg = 'bslogger-info-test-' + Date.now()

    bslogger.info(msg)
    await waitForInsert()

    const record = await Log.findOne({ data: msg })
    expect(record).toBeDefined()
    expect(record.level).toBe('info')
    expect(record.source).toBe('browser')
    expect(record.data).toContain(msg)
    expect(record.startTime).toBeInstanceOf(Date)
    expect(Math.abs(record.startTime - now)).toBeLessThan(3000)
  })
})
