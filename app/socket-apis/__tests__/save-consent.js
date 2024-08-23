import saveConsent from '../save-consent'

const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'

const USER_ID = '6667d5a33da5d19ddc304a6b'
const synuser = { synuser: { id: USER_ID } }

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

test('Test something here.', async () => {
  await saveConsent.call(synuser, [
    {
      category: 'ConsentOption1',
      isGranted: true,
      terms: 'By consenting, you agree to consent to this agreement.',
    },
  ])
})
