import saveConsent from '../save-consent'

const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'

const USER_ID = '6667d5a33da5d19ddc304a6b'
const synuser = { synuser: { id: USER_ID } }

import Consent from '../../models/consent'

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

let MemoryServer
beforeAll(async () => {
  MemoryServer = await MongoMemoryServer.create()
  const uri = MemoryServer.getUri()
  await Mongo.connect(uri)
})

afterAll(async () => {
  Mongo.disconnect()
  MemoryServer.stop()
})

test('Test new consent doc is made when who query has no match.', async () => {
  const cb = jest.fn()
  await saveConsent.call(
    synuser,
    [
      {
        category: 'ConsentOption1',
        isGranted: true,
        terms: 'By consenting, you agree to consent to this agreement.',
      },
    ],
    cb
  )

  expect(cb).toHaveBeenCalledTimes(1)
  expect(cb).toHaveBeenCalledWith({ created: true })
})

test('Test new consent doc is update when who query has a match.', async () => {
  // Was already created from the last test
  const cb = jest.fn()
  await saveConsent.call(
    synuser,
    [
      {
        category: 'ConsentOption2',
        isGranted: true,
        terms: 'By consenting twice, you agree to more than 1 time.',
      },
    ],
    cb
  )

  expect(cb).toHaveBeenCalledTimes(1)
  expect(cb).toHaveBeenCalledWith({ created: false })

  const consentDoc = await Consent.findOne({ who: { userId: USER_ID } })
  expect(consentDoc).toMatchObject({
    _id: /./,
    who: { userId: '6667d5a33da5d19ddc304a6b' },
    what: {
      ConsentOption1: {
        isGranted: true,
        consentDate: expect.any(Date),
        terms: 'By consenting, you agree to consent to this agreement.',
        history: [],
      },
      ConsentOption2: {
        isGranted: true,
        consentDate: expect.any(Date),
        terms: 'By consenting twice, you agree to more than 1 time.',
        history: [],
      },
    },
  })
})

test('Test failure when neither user or ip address identifier is usable.', async () => {
  const cb = jest.fn()
  await saveConsent.call(
    null,
    [
      {
        category: 'ConsentOption1',
        isGranted: true,
        terms: 'By consenting, you agree to consent to this agreement.',
      },
    ],
    cb
  )

  expect(cb).toHaveBeenCalledTimes(1)
  expect(cb).toHaveBeenCalledWith(undefined)
})
