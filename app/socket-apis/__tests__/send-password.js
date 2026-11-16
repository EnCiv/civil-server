const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'
import { beforeAll } from '@jest/globals'
import sendPassword from '../send-password'
import { SibGetTemplateId, SibSendTransacEmail } from '../../lib/send-in-blue-transactional'
const User = require('../../models/user')

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

// mocked send-in-blue-transactional functions 
jest.mock('../../lib/send-in-blue-transactional', ()=>({
  SibGetTemplateId: jest.fn(()=> true),
  SibSendTransacEmail: jest.fn()
}))

test('correct creation of mock functions', ()=>{
  expect(jest.isMockFunction(SibGetTemplateId)).toBeTruthy()
  expect(jest.isMockFunction(SibSendTransacEmail)).toBeTruthy()
})

// configure temporary db
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

describe('setup test db', ()=>{
  
  beforeAll(async () => {
    const dbUser = { email: 'success@email.com', password: 'password', firstName: 'Test', lastName: 'User' }
    const createdUser = await User.create(dbUser)
  })

  test('the db should contain 1 document', async () => {
    
    const count = await User.countDocuments({})
    expect(count).toBe(1)
  })

  test('Test user should exist', async () => {
    const user = await User.findOne({ email: 'success@email.com'})
    expect(user.email).toBe('success@email.com')
    expect(user.firstName).toBe('Test')
    expect(user.lastName).toBe('User')
  })
})

describe('sendPassword function', ()=> {
    let mockEmail = 'success@email.com'
    let mockReturnTo = '/join'
    // prevents host from being undefined when running jest tests
    const mockThisObj = { handshake : { headers : { host : 'localhost:3011'}}}

    it('should execute callback function with "User not found" argument if email not in db', async ()=>{
      let mockCb = jest.fn()
      mockEmail = 'missing@email.com'
      await sendPassword.call( mockThisObj, mockEmail, mockReturnTo, mockCb)
      expect(mockCb).toHaveBeenCalledWith({ error: 'User not found'})
    })

    it('should execute callback with error if reset password email fails to send', async ()=> {
      let mockCb = jest.fn()
      mockEmail = 'success@email.com'
      SibSendTransacEmail.mockImplementation(() => false)
      await sendPassword.call( mockThisObj, mockEmail, mockReturnTo, mockCb)
      expect(mockCb).toHaveBeenCalledWith('error sending reset password email')
    })

    it('should execute callback function once without any arguments if reset email was sent successfully', async ()=>{
      let mockCb = jest.fn()
      mockEmail = 'success@email.com'
      SibSendTransacEmail.mockClear()
      SibSendTransacEmail.mockImplementation(() => true)
      await sendPassword.call( mockThisObj, mockEmail, mockReturnTo, mockCb)
      expect(mockCb).toHaveBeenCalledWith()
      expect(mockCb).toHaveBeenCalledTimes(1)
      expect(SibSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['reset-password'] })
      )
    })

    it('should send the welcome template when requested', async()=>{
      const mockCb = jest.fn()
      SibGetTemplateId.mockClear()
      SibSendTransacEmail.mockImplementation(() => true)

      await sendPassword.call(mockThisObj, mockEmail, { returnTo: mockReturnTo, emailType: 'welcome' }, mockCb)

      expect(SibGetTemplateId).toHaveBeenCalledWith(expect.stringMatching(/welcome-password\.html$/))
      expect(SibSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['welcome-password'] })
      )
      expect(mockCb).toHaveBeenCalledWith()
    })

    it('should find users with mixed-case email input', async()=>{
      const mockCb = jest.fn()
      SibSendTransacEmail.mockImplementation(() => true)

      await sendPassword.call(mockThisObj, ' Success@Email.com ', mockReturnTo, mockCb)

      expect(SibSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: [{ email: 'success@email.com' }] })
      )
      expect(mockCb).toHaveBeenCalledWith()
    })

    it('should use the default template for unknown email types', async()=>{
      const mockCb = jest.fn()
      SibSendTransacEmail.mockClear()
      SibSendTransacEmail.mockImplementation(() => true)

      await sendPassword.call(mockThisObj, mockEmail, { returnTo: mockReturnTo, emailType: 'unknown' }, mockCb)

      expect(SibSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['reset-password'] })
      )
      expect(mockCb).toHaveBeenCalledWith()
    })
})