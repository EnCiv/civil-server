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
  const EXPIRED_DATE = () => new Date(Date.now() - (TOKEN_EXPIRATION_TIME_MINUTES + 1) * 60 * 1000)
  let user

  beforeEach(async () => {
    await User.deleteMany({})
    // User.create replaces .password with its hash on the object it is given, so pass a copy
    user = await User.create({ ...dbUser })
  })

  test('token expired', async () => {
    await User.updateOne({ activationKey, activationToken }, { $set: { tokenExpirationDate: EXPIRED_DATE() } })

    expect(await User.resetPassword(activationToken, activationKey, 'newPassword')).toEqual({
      success: false,
      code: 'RESET_KEY_EXPIRED',
    })
  })

  test('token not found', async () => {
    expect(await User.resetPassword('noSuchToken', activationKey, 'newPassword')).toEqual({
      success: false,
      code: 'INVALID_RESET_KEY',
    })
  })

  test('key does not match', async () => {
    expect(await User.resetPassword(activationToken, 'wrongKey', 'newPassword')).toEqual({
      success: false,
      code: 'INVALID_RESET_KEY',
    })
  })

  test('tokenExpirationDate missing', async () => {
    await User.updateOne({ activationKey, activationToken }, { $unset: { tokenExpirationDate: '' } })

    expect(await User.resetPassword(activationToken, activationKey, 'newPassword')).toEqual({
      success: false,
      code: 'INVALID_RESET_KEY',
    })
  })

  test('object and non-string tokens/keys are rejected without querying mongo', async () => {
    const findOne = jest.spyOn(User, 'findOne')
    try {
      for (const bad of [{ $regex: '^a' }, { $ne: '' }, ['x'], 123, null, undefined, '']) {
        expect(await User.resetPassword(bad, activationKey, 'newPassword')).toEqual({ success: false, code: 'INVALID_RESET_KEY' })
        expect(await User.resetPassword(activationToken, bad, 'newPassword')).toEqual({ success: false, code: 'INVALID_RESET_KEY' })
      }
      expect(findOne).not.toHaveBeenCalled()
    } finally {
      findOne.mockRestore()
    }
  })

  test('empty tokens do not match users whose tokens were already cleared', async () => {
    await User.resetPassword(activationToken, activationKey, 'firstPassword')
    expect(await User.resetPassword('', '', 'secondPassword')).toEqual({ success: false, code: 'INVALID_RESET_KEY' })
    const updatedUser = await User.findOne({ email })
    expect(await User.validatePassword(updatedUser, 'firstPassword')).toBeTruthy()
  })

  test('invalid new password is rejected without querying mongo and leaves the token intact', async () => {
    const findOne = jest.spyOn(User, 'findOne')
    try {
      for (const bad of ['', undefined, null, 123, { $ne: '' }]) {
        expect(await User.resetPassword(activationToken, activationKey, bad)).toEqual({ success: false, code: 'INVALID_PASSWORD' })
      }
      expect(findOne).not.toHaveBeenCalled()
    } finally {
      findOne.mockRestore()
    }
    const unchanged = await User.findOne({ email })
    expect(unchanged.activationToken).toBe(activationToken)
    expect(unchanged.activationKey).toBe(activationKey)
    expect(await User.validatePassword(unchanged, 'password')).toBeTruthy()
  })

  test('happy reset', async () => {
    const newPassword = 'newPassword'
    expect(await User.resetPassword(activationToken, activationKey, newPassword)).toEqual({ success: true })

    const updatedUser = await User.findOne({ email: 'resetUser@email.com' })
    const expectedDbUser = { ...dbUser }
    expectedDbUser.activationKey = ''
    expectedDbUser.activationToken = ''
    expectedDbUser.tokenExpirationDate = ''
    expectedDbUser.password = expect.stringMatching(HASHED_PASSWORD_REGEX)
    expect(updatedUser).toMatchObject(expectedDbUser)
    expect(await User.validatePassword(updatedUser, newPassword)).toBeTruthy()
  })

  test('the token can only be used once', async () => {
    expect(await User.resetPassword(activationToken, activationKey, 'firstPassword')).toEqual({ success: true })
    expect(await User.resetPassword(activationToken, activationKey, 'secondPassword')).toEqual({
      success: false,
      code: 'INVALID_RESET_KEY',
    })
    const updatedUser = await User.findOne({ email })
    expect(await User.validatePassword(updatedUser, 'firstPassword')).toBeTruthy()
  })

  test('concurrent resets with the same token yield exactly one success', async () => {
    const results = await Promise.all([
      User.resetPassword(activationToken, activationKey, 'passwordOne'),
      User.resetPassword(activationToken, activationKey, 'passwordTwo'),
    ])
    expect(results.filter(r => r.success)).toHaveLength(1)
    expect(results.filter(r => !r.success)).toEqual([{ success: false, code: 'INVALID_RESET_KEY' }])
  })
})

describe('checkResetToken method', () => {
  const email = 'tokenStatusUser@email.com'
  const activationKey = 'activationKey02'
  const activationToken = 'activationTokenStatus'
  const dbUser = {
    email: email,
    password: 'password',
    firstName: 'Test',
    lastName: 'User',
    activationKey: activationKey,
    activationToken: activationToken,
    tokenExpirationDate: new Date(),
  }

  beforeEach(async () => {
    await User.deleteMany({})
    await User.create({ ...dbUser })
  })

  test('token not found', async () => {
    expect(await User.checkResetToken('noSuchToken')).toEqual({ expired: true, code: 'INVALID_RESET_KEY' })
  })

  test('token found and not expired', async () => {
    expect(await User.checkResetToken(activationToken)).toEqual({ expired: false, code: undefined })
  })

  test('token found and expired', async () => {
    const expiredDate = new Date(Date.now() - (TOKEN_EXPIRATION_TIME_MINUTES + 1) * 60 * 1000)
    await User.updateOne({ activationToken }, { $set: { tokenExpirationDate: expiredDate } })

    expect(await User.checkResetToken(activationToken)).toEqual({ expired: true, code: 'RESET_KEY_EXPIRED' })
  })

  test('tokenExpirationDate missing is invalid, matching resetPassword', async () => {
    await User.updateOne({ activationToken }, { $unset: { tokenExpirationDate: '' } })

    expect(await User.checkResetToken(activationToken)).toEqual({ expired: true, code: 'INVALID_RESET_KEY' })
  })

  test('object and non-string tokens are rejected without querying mongo', async () => {
    const findOne = jest.spyOn(User, 'findOne')
    try {
      for (const bad of [{ $regex: '^a' }, { $ne: '' }, ['x'], 123, null, undefined, '']) {
        expect(await User.checkResetToken(bad)).toEqual({ expired: true, code: 'INVALID_RESET_KEY' })
      }
      expect(findOne).not.toHaveBeenCalled()
    } finally {
      findOne.mockRestore()
    }
  })
})

describe('User.validate schema (joi)', () => {
  test('accepts a valid user document', () => {
    const { error } = User.validate({ email: 'test@example.com', password: 'abc', firstName: 'A', lastName: 'B' })
    expect(error).toBeUndefined()
  })

  test('accepts document with optional fields omitted', () => {
    const { error } = User.validate({ email: 'test@example.com', password: 'abc' })
    expect(error).toBeUndefined()
  })

  test('accepts empty activationToken and activationKey strings', () => {
    const { error } = User.validate({
      email: 'test@example.com',
      password: 'abc',
      activationToken: '',
      activationKey: '',
    })
    expect(error).toBeUndefined()
  })

  test('rejects invalid email format', () => {
    const { error } = User.validate({ email: 'not-an-email', password: 'abc' })
    expect(error).toBeDefined()
    expect(error.message).toMatch(/email/)
  })

  test('validate returns error object rather than throwing', () => {
    expect(() => User.validate({ email: 'bad' })).not.toThrow()
    const result = User.validate({ email: 'bad' })
    expect(result).toHaveProperty('error')
  })
})
