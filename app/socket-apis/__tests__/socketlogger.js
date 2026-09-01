/**
 * @jest-environment jsdom
 */
// End-to-end tests for browser-side logging.
//
// Two pipelines are tested together in the "full pipeline" describe block by
// making a single logger.info() call and then asserting both outputs:
//
//   window.logger.info(msg)
//       ├─► bconsoleAppender  →  console.log(timestamp, category, msg)
//       └─► clientSocketlogger → window.socket.emit('socketlogger', loggingEvent)
//                                      │
//                                      ▼  (real socket.io round-trip)
//                              server socketlogger.js
//                                      │  bslogger.info(startTime, msg, {socketId, userId})
//                                      ▼
//                              mongologgerAppender (source:'browser')
//                                      │
//                                      ▼
//                              logs collection  ← we query this

import { jest, describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals'
import { Mongo } from '@enciv/mongo-collections'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createLogger } from 'civil-client/app/client/logger'
import { createBconsoleAppender } from 'civil-client/app/client/bconsole'
import { createSocketloggerAppender } from 'civil-client/app/client/socketlogger'
import serverSocketlogger from '../socketlogger'
import { createMongoAppender } from '../../server/util/mongo-logger'
import Log from '../../models/log'
import jestSocketApiSetup, { jestSocketApiTeardown } from '../../server/util/jest-socket-api-setup'

// Prevent Log.create from bailing out before the DB is connected.
if (!global.logger) global.logger = console

const TEST_USER_ID = 'test-user-logger-001'

let MemoryServer

beforeAll(async () => {
  MemoryServer = await MongoMemoryServer.create()
  await Mongo.connect(MemoryServer.getUri())
})

afterAll(async () => {
  await Mongo.disconnect()
  await MemoryServer.stop()
})

// mongologgerAppender calls Log.create() without awaiting it.
const waitForInsert = () => new Promise(resolve => setTimeout(resolve, 300))

// ---------------------------------------------------------------------------
// bconsole appender
// ---------------------------------------------------------------------------
describe('bconsole appender', () => {
  let consoleSpy

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    window.logger = createLogger([createBconsoleAppender()])
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  test('logger.info calls console.log with the message and a timestamp near now', () => {
    const now = new Date()
    const msg = 'bconsole-test-' + Date.now()

    window.logger.info(msg, { extra: true })

    expect(consoleSpy).toHaveBeenCalled()
    const allArgs = consoleSpy.mock.calls.flat()
    // The message and extra object should appear somewhere in the call arguments.
    expect(allArgs).toContain(msg)
    expect(allArgs).toContainEqual({ extra: true })

    // bconsole formats startTime as a string like "2026May19 10:30:00".
    // It is always the first argument.  Check it looks like a date string.
    const timestampArg = consoleSpy.mock.calls[0][0]
    expect(typeof timestampArg).toBe('string')
    expect(timestampArg.length).toBeGreaterThan(8)
  })

  test('logger.error calls console.log and includes the message', () => {
    const msg = 'bconsole-error-' + Date.now()
    window.logger.error(msg)
    expect(consoleSpy).toHaveBeenCalled()
    expect(consoleSpy.mock.calls.flat()).toContain(msg)
  })
})

// ---------------------------------------------------------------------------
// Full pipeline: bconsole + socketlogger → bslogger → mongo
// ---------------------------------------------------------------------------
describe('socketlogger: browser → socket → bslogger → mongo', () => {
  let consoleSpy

  beforeAll(async () => {
    // Wire a real socket.io server that handles 'socketlogger' events.
    await jestSocketApiSetup(TEST_USER_ID, [['socketlogger', serverSocketlogger]])
    global.bslogger = createLogger([createMongoAppender('browser')])
    window.logger = createLogger([createBconsoleAppender(), createSocketloggerAppender()])
  })

  afterAll(() => {
    jestSocketApiTeardown()
  })

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  test('logger.info triggers both bconsole (console.log) and the socket→mongo pipeline', async () => {
    const now = new Date()
    const msg = 'full-pipeline-test-' + Date.now()

    window.logger.info(msg, { pipe: 'end-to-end' })

    // --- bconsole side: console.log should have been called synchronously ---
    expect(consoleSpy).toHaveBeenCalled()
    const allArgs = consoleSpy.mock.calls.flat()
    expect(allArgs).toContain(msg)
    expect(allArgs).toContainEqual({ pipe: 'end-to-end' })
    // First arg is the formatted timestamp string
    const timestampArg = consoleSpy.mock.calls[0][0]
    expect(typeof timestampArg).toBe('string')
    expect(timestampArg.length).toBeGreaterThan(8)

    // --- socket→mongo side: wait for the async round-trip and DB insert ---
    await waitForInsert()

    const record = await Log.findOne({ data: msg })
    expect(record).toBeDefined()
    expect(record.level).toBe('info')
    expect(record.source).toBe('browser')
    // data array: [originalStartTime, msg, {pipe:'end-to-end'}, {socketId, userId}]
    expect(record.data).toContain(msg)
    expect(record.data).toContainEqual({ pipe: 'end-to-end' })
    // The socket handler appends {socketId, userId} — verify userId matches
    expect(record.data).toContainEqual(expect.objectContaining({ userId: TEST_USER_ID }))
    // startTime of the Log record is when bslogger.info() was called on the
    // server — should be within 3 seconds of the original call.
    expect(record.startTime).toBeInstanceOf(Date)
    expect(Math.abs(record.startTime - now)).toBeLessThan(3000)
  })

  test('logger.error is recorded with level "error" in mongo', async () => {
    const now = new Date()
    const msg = 'full-pipeline-error-' + Date.now()

    window.logger.error(msg)
    await waitForInsert()

    const record = await Log.findOne({ data: msg })
    expect(record).toBeDefined()
    expect(record.level).toBe('error')
    expect(record.source).toBe('browser')
    expect(record.data).toContain(msg)
    expect(record.startTime).toBeInstanceOf(Date)
    expect(Math.abs(record.startTime - now)).toBeLessThan(3000)
  })
})
