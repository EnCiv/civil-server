const MongoModels = require('mongo-models')
const User = require('../user')

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

const HASHED_PASSWORD_REGEX = /^[0-9a-zA-Z$/.]{60}$/
const BASE_64_REGEX = /^[0-9a-zA-Z]{16}$/
const TOKEN_EXPIRATION_TIME_MINUTES = 10

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
  const count = await User.count({})
  expect(count).toBe(0)
})

describe('create method', () => {
  test('happy insert', async () => {
    const dbUser = { email: 'success@email.com', password: 'password', firstName: 'Test', lastName: 'User' }
    await User.create(dbUser)
    const user = await User.findOne({ email: 'success@email.com' })
    const expectedDbUser = dbUser
    expectedDbUser.password = expect.stringMatching(HASHED_PASSWORD_REGEX)
    expect(user).toMatchObject(dbUser)
  })

  test('missing password', async () => {
    const dbUser = { email: 'missing@email.com', firstName: 'Test', lastName: 'User' }
    await expect(async () => {
      await User.create(dbUser)
    }).rejects.toThrow(new Error('User.create attempted, but no password. name=undefined, email=missing@email.com'))
  })
})

test('generateTokenAndKey method', async () => {
  const email = 'generateUser@email.com'
  const dbUser = {
    email: email,
    password: 'password',
    firstName: 'Test',
    lastName: 'User',
  }
  let user = await User.create(dbUser)
  user = await user.generateTokenAndKey()

  const expectedDbUser = dbUser
  expectedDbUser.password = expect.stringMatching(HASHED_PASSWORD_REGEX)
  expectedDbUser.activationKey = expect.stringMatching(BASE_64_REGEX)
  expectedDbUser.activationToken = expect.stringMatching(BASE_64_REGEX)
  // expectedDbUser.tokenExpirationDate = expect.dateMatching()

  expect(user).toMatchObject(expectedDbUser)
})

describe('resetPassword method', () => {
  const email = 'resetUser@email.com'
  const activationKey = 'activationKey01'
  const activationToken = 'activationToken'
  const dbUser = {
    email: email,
    password: 'password',
    firstName: 'Test',
    lastName: 'User',
    activationKey: activationKey,
    activationToken: activationToken,
    tokenExpirationDate: new Date(),
  }
  let user

  beforeEach(async () => {
    await User.deleteMany({})
    user = await User.create(dbUser)
  })

  test('token expired', async () => {
    const dateNow = new Date()
    const expiredDate = new Date().setMinutes(dateNow.getMinutes() - TOKEN_EXPIRATION_TIME_MINUTES)
    User.updateOne(
      { activationKey, activationToken },
      {
        $set: {
          tokenExpirationDate: expiredDate,
        },
      }
    )

    await expect(async () => {
      await User.resetPassword(activationToken, activationKey, 'newPassword')
    }).rejects.toThrow(new Error('token expired'))
  })

  test('happy reset', async () => {
    const newPassword = 'newPassword'
    console.log('before update', user)
    await User.resetPassword(activationToken, activationKey, newPassword)

    const updatedUser = await User.findOne({ email: 'resetUser@email.com' })
    console.log('updated user', updatedUser)
    const expectedDbUser = dbUser
    expectedDbUser.activationKey = null
    expectedDbUser.activationToken = null
    expectedDbUser.tokenExpirationDate = null
    expectedDbUser.password = expect.stringMatching(HASHED_PASSWORD_REGEX)

    expect(updatedUser).toMatchObject(expectedDbUser)
    expect(await updatedUser.validatePassword(newPassword)).toBeTruthy()
  })
})
