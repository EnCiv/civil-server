const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'
import resetPassword from '../reset-password'
import messages from '../../lib/reset-password-messages'
const User = require('../../models/user')

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

let MemoryServer
beforeAll(async () => {
  MemoryServer = await MongoMemoryServer.create()
  await Mongo.connect(MemoryServer.getUri())
})

afterAll(async () => {
  Mongo.disconnect()
  MemoryServer.stop()
})

describe('reset-password socket api', () => {
  const email = 'resetApi@email.com'
  const activationKey = 'resetApiKey01'
  const activationToken = 'resetApiToken01'

  beforeEach(async () => {
    jest.restoreAllMocks()
    jest.spyOn(logger, 'warn').mockImplementation(() => {})
    jest.spyOn(logger, 'error').mockImplementation(() => {})
    await User.deleteMany({})
    await User.create({
      email,
      password: 'password',
      firstName: 'Test',
      lastName: 'User',
      activationKey,
      activationToken,
      tokenExpirationDate: new Date(),
    })
  })

  test('success calls back once with { success: true }', async () => {
    const cb = jest.fn()
    await resetPassword(activationToken, activationKey, 'newPassword', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: true })
    expect(await User.validatePassword(await User.findOne({ email }), 'newPassword')).toBeTruthy()
  })

  test('unknown token calls back once with INVALID_RESET_KEY', async () => {
    const cb = jest.fn()
    await resetPassword('noSuchToken', activationKey, 'newPassword', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: false, code: 'INVALID_RESET_KEY', message: messages.INVALID_RESET_KEY })
  })

  test('expired token calls back once with RESET_KEY_EXPIRED', async () => {
    await User.updateOne({ activationToken }, { $set: { tokenExpirationDate: new Date(Date.now() - 11 * 60 * 1000) } })
    const cb = jest.fn()
    await resetPassword(activationToken, activationKey, 'newPassword', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: false, code: 'RESET_KEY_EXPIRED', message: messages.RESET_KEY_EXPIRED })
  })

  test('invalid password calls back once with INVALID_PASSWORD', async () => {
    const cb = jest.fn()
    await resetPassword(activationToken, activationKey, '', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: false, code: 'INVALID_PASSWORD', message: messages.INVALID_PASSWORD })
  })

  test('object-valued token is rejected without querying mongo', async () => {
    const findOne = jest.spyOn(User, 'findOne')
    const cb = jest.fn()
    await resetPassword({ $regex: '^a' }, activationKey, 'newPassword', cb)
    expect(findOne).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: false, code: 'INVALID_RESET_KEY', message: messages.INVALID_RESET_KEY })
  })

  test('unexpected error calls back once with GENERIC_RESET_ERROR', async () => {
    jest.spyOn(User, 'resetPassword').mockRejectedValueOnce(new Error('db exploded'))
    const cb = jest.fn()
    await resetPassword(activationToken, activationKey, 'newPassword', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
    expect(logger.error).toHaveBeenCalled()
  })
})
