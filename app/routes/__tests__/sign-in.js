const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'
import { signIn } from '../sign-in'
import { beforeAll } from '@jest/globals'
const User = require('../../models/user')


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

describe('signIn Function', ()=> {
  let mockResponse
  let mockRequest = {
    body: {
      email: '',
      password: ''
    } 
  }
  mockResponse = {
    statusCode: null,
    json: jest.fn().mockReturnValue(mockResponse)
  }
  const next = jest.fn();

  it('should return 400 status code if email is missing', async()=>{ 
    mockRequest.body.password = 'password'
    await signIn(mockRequest, mockResponse, next)   
    expect(mockResponse.statusCode).toBe(400)
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing email'})
  })

  it('should return 400 statusCode if password is missing', async()=>{
    mockRequest.body.email = 'success@gmail.com'
    mockRequest.body.password = ''
    await signIn(mockRequest, mockResponse, next)
    expect(mockResponse.statusCode).toBe(400)
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing password'})
  })
})