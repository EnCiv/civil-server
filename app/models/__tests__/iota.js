const MongoModels = require('mongo-models')
const Iota = require('../iota')

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

beforeAll(async () => {
  await MongoModels.connect({ uri: global.__MONGO_URI__ }, { useUnifiedTopology: true })
  const { toInit = [] } = MongoModels.toInit
  MongoModels.toInit = []
  for await (const init of toInit) await init()
})

afterAll(async () => {
  MongoModels.disconnect()
})

test('the db is empty', async () => {
  const count = await Iota.count({})
  expect(count).toBe(0)
})

test('the db starts up', async () => {
  const anIota = { path: '/test1', subject: 'it starts up', description: 'well described startup' }
  const iota = await Iota.create(anIota)
  expect(iota).toMatchObject(anIota)
})

test('the db has iotas', async () => {
  const iotas = await Iota.find({})
  expect(iotas.length).toBe(1)
  // this will fail if there are other test running and putting things in the database
})

test('can not create Iota with duplicate path', async () => {
  expect(async () => {
    await expect(
      Promise.reject(
        Iota.create({
          path: '/test1',
          subject: 'it starts up again',
          description: 'well described startup again',
        })
      )
    ).rejects.toThrow()
  })
})

test('can not create Iota without subject', async () => {
  expect(async () => {
    await expect(
      Promise.reject(
        Iota.create({
          path: '/test2',
          // there is no subject:
          description: 'well described startup again',
        })
      )
    ).rejects.toThrow()
  })
})

test('can not create Iota with non-schema property', async () => {
  expect(async () => {
    await expect(
      Promise.reject(
        Iota.create({
          path: '/test5',
          subject: 'non-schema property',
          description: 'test with a non schema defined property',
          nonSchema: 'this should not work',
        })
      )
    ).rejects.toThrow()
  })
})
