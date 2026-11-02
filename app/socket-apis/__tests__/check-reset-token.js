const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'
import checkResetToken from '../check-reset-token'
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

describe('check-reset-token socket api', () => {
  const activationToken = 'checkApiToken01'

  beforeEach(async () => {
    jest.restoreAllMocks()
    jest.spyOn(logger, 'error').mockImplementation(() => {})
    await User.deleteMany({})
    await User.create({
      email: 'checkApi@email.com',
      password: 'password',
      firstName: 'Test',
      lastName: 'User',
      activationKey: 'checkApiKey01',
      activationToken,
      tokenExpirationDate: new Date(),
    })
  })

  test('valid, unexpired token calls back once with expired false and no code', async () => {
    const cb = jest.fn()
    await checkResetToken(activationToken, cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: true, expired: false, code: undefined, message: undefined })
  })

  test('expired token calls back once with RESET_KEY_EXPIRED', async () => {
    await User.updateOne({ activationToken }, { $set: { tokenExpirationDate: new Date(Date.now() - 11 * 60 * 1000) } })
    const cb = jest.fn()
    await checkResetToken(activationToken, cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({
      success: true,
      expired: true,
      code: 'RESET_KEY_EXPIRED',
      message: messages.RESET_KEY_EXPIRED,
    })
  })

  test('unknown token calls back once with INVALID_RESET_KEY', async () => {
    const cb = jest.fn()
    await checkResetToken('noSuchToken', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({
      success: true,
      expired: true,
      code: 'INVALID_RESET_KEY',
      message: messages.INVALID_RESET_KEY,
    })
  })

  test('object-valued token is rejected without querying mongo', async () => {
    const findOne = jest.spyOn(User, 'findOne')
    const cb = jest.fn()
    await checkResetToken({ $regex: '^a' }, cb)
    expect(findOne).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({
      success: true,
      expired: true,
      code: 'INVALID_RESET_KEY',
      message: messages.INVALID_RESET_KEY,
    })
  })

  test('unexpected error calls back once with GENERIC_RESET_ERROR', async () => {
    jest.spyOn(User, 'checkResetToken').mockRejectedValueOnce(new Error('db exploded'))
    const cb = jest.fn()
    await checkResetToken(activationToken, cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
    expect(logger.error).toHaveBeenCalled()
  })
})
