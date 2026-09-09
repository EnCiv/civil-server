'use strict'

const { Mongo } = require('@enciv/mongo-collections')
import { MongoMemoryServer } from 'mongodb-memory-server'
import { signUp } from '../sign-up'
const User = require('../../models/user')

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

describe('signUp function', () => {
  let mockResponse
  let mockRequest
  let next

  beforeEach(() => {
    mockRequest = { body: {} }
    mockResponse = {
      statusCode: null,
      json: jest.fn().mockReturnValue(undefined),
    }
    next = jest.fn()
  })

  it('returns 400 if email is missing', () => {
    mockRequest.body = { password: 'password' }
    signUp(mockRequest, mockResponse, next)
    expect(mockResponse.statusCode).toBe(400)
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing email' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 400 if password is missing', () => {
    mockRequest.body = { email: 'test@email.com' }
    signUp(mockRequest, mockResponse, next)
    expect(mockResponse.statusCode).toBe(400)
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing password' })
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() with user set on req when signup succeeds', async () => {
    mockRequest.body = { email: 'newuser@email.com', password: 'password', firstName: 'Jane', lastName: 'Doe' }
    signUp(mockRequest, mockResponse, next)
    // User.create is async — wait for next to be called
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(next).toHaveBeenCalledWith()
    expect(mockRequest.user).toBeDefined()
    expect(mockRequest.user.email).toBe('newuser@email.com')
  })

  it('returns 401 if email is already in use', async () => {
    // create the user first
    await User.create({ email: 'duplicate@email.com', password: 'password' })
    mockRequest.body = { email: 'duplicate@email.com', password: 'password' }
    signUp(mockRequest, mockResponse, next)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(mockResponse.statusCode).toBe(401)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('duplicate@email.com') })
    )
    expect(next).not.toHaveBeenCalledWith()
  })
})
