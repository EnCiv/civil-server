const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'
const User = require('../user')

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

const HASHED_PASSWORD_REGEX = /^[0-9a-zA-Z$/.]{60}$/
const BASE_64_REGEX = /^[0-9a-zA-Z]{16}$/
const TOKEN_EXPIRATION_TIME_MINUTES = 10

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

test('the db is empty', async () => {
  const count = await User.countDocuments({})
  expect(count).toBe(0)
})

describe('create method', () => {
  test('happy insert', async () => {
    const dbUser = { email: 'success@email.com', password: 'password', firstName: 'Test', lastName: 'User' }
    const createdUser = await User.create(dbUser)
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

test('validatePassword method', async () => {
  const user = new User({ password: '$2b$10$PEA9iHuap7j24h.yR2zOjOr5hOhX131zS6.iwXjmxMXCVh9zUsfPq' })
  expect(await User.validatePassword(user, 'nottherightpassword')).toBeFalsy()
  expect(await User.validatePassword(user, 'password')).toBeTruthy()
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
  user = await User.generateTokenAndKey(user)

  const expectedDbUser = dbUser
  expectedDbUser.password = expect.stringMatching(HASHED_PASSWORD_REGEX)
  expectedDbUser.activationKey = expect.stringMatching(BASE_64_REGEX)
  expectedDbUser.activationToken = expect.stringMatching(BASE_64_REGEX)

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
    await User.resetPassword(activationToken, activationKey, newPassword)

    const updatedUser = await User.findOne({ email: 'resetUser@email.com' })
    const expectedDbUser = dbUser
    expectedDbUser.activationKey = ''
    expectedDbUser.activationToken = ''
    expectedDbUser.tokenExpirationDate = ''
    expectedDbUser.password = expect.stringMatching(HASHED_PASSWORD_REGEX)
    expect(updatedUser).toMatchObject(expectedDbUser)
    expect(await User.validatePassword(updatedUser, newPassword)).toBeTruthy()
  })
})
