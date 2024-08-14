const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'
const Consent = require('../consent')

const USER_ID = '6667d5a33da5d19ddc304a6b'

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

test('Test the database is empty on startup.', async () => {
  const count = await Consent.count({})
  expect(count).toBe(0)
})

test('Testing adding a consent obj.', async () => {
  const aConsent = { who: { userId: USER_ID } }
  const consent = await Consent.create(aConsent)
  expect(consent).toMatchObject(aConsent)
})

test('Test consents exist in the DB.', async () => {
  const consents = await Consent.find({}).toArray()
  expect(consents.length).toBeGreaterThan(0)
  // this will fail if there are other test running and putting things in the database
})

test('Test adding consent data.', async () => {
  const aConsent = { who: { userId: USER_ID }, what: {} }
  const consentObj = await Consent.create(aConsent)

  const updatedDoc = await Consent.updateConsent(
    consentObj,
    'ConsentOption1',
    true,
    'By consenting, you agree to consent to this agreement.'
  )
})

test('Test historical consent data is pushed.', async () => {
  const aConsent = { who: { userId: USER_ID }, what: {} }
  const consentObj = await Consent.create(aConsent)

  // Update the same consent option twice
  await Consent.updateConsent(
    consentObj,
    'ConsentOption1',
    true,
    'By consenting, you agree to consent to this agreement.'
  )

  await Consent.updateConsent(
    consentObj,
    'ConsentOption1',
    true,
    'By consenting a second time, you agree to consent to this agreement being pushed to the history.'
  )

  await Consent.updateConsent(
    consentObj,
    'ConsentOption2',
    true,
    "By consenting to another option, you've agreed there's two options now."
  )

  const updatedDoc = await Consent.updateConsent(
    consentObj,
    'ConsentOption1',
    false,
    "By revoking your consent, you don't agree to consent."
  )

  expect(updatedDoc).toMatchObject({
    _id: /./,
    who: { userId: '6667d5a33da5d19ddc304a6b' },
    what: {
      ConsentOption1: {
        isGranted: false,
        consentDate: /./,
        terms: "By revoking your consent, you don't agree to consent.",
        history: [
          {
            isGranted: true,
            consentDate: /./,
            terms: 'By consenting, you agree to consent to this agreement.',
          },
          {
            isGranted: true,
            consentDate: /./,
            terms: 'By consenting a second time, you agree to consent to this agreement being pushed to the history.',
          },
        ],
      },
      ConsentOption2: {
        isGranted: true,
        consentDate: /./,
        terms: "By consenting to another option, you've agreed there's two options now.",
        history: [],
      },
    },
  })
})
