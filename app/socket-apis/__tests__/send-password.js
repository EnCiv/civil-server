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

jest.mock('../../lib/send-in-blue-transactional', ()=>({
  SibGetTemplateId: jest.fn(()=> 'test'),
  SibSendTransacEmail: jest.fn(()=> 'test2'),
}))

test('correct creation of mock functions', ()=>{
  expect(jest.isMockFunction(SibGetTemplateId)).toBeTruthy()
  expect(jest.isMockFunction(SibSendTransacEmail)).toBeTruthy()
})

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
    let mockCb = jest.fn()
    
    it('should execute callback function with "User not found" argument if email not in db', async ()=>{
      mockEmail = 'missing@email.com'
      await sendPassword(mockEmail, mockReturnTo, mockCb)
      expect(mockCb).toHaveBeenCalledWith({ error: 'User not found'})
    })
})