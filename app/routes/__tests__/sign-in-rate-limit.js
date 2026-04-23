/**
 * Tests for express-rate-limit behavior on the sign-in route.
 * These tests verify the rate limiter rejects excess requests with 429
 * and that the limit/message options work correctly (express-rate-limit v7+).
 *
 * Uses supertest to send real HTTP requests so the in-memory store counts correctly.
 * A fresh express app + limiter instance is created for each test to avoid shared state.
 */

import express from 'express'
import expressRateLimit from 'express-rate-limit'
import supertest from 'supertest'

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

function buildApp({ limit = 3, windowMs = 60000, message = 'Too many attempts' } = {}) {
  const app = express()
  const limiter = expressRateLimit({ limit, windowMs, message })
  app.get('/test', limiter, (req, res) => res.json({ ok: true }))
  return app
}

describe('express-rate-limit v7', () => {
  test('requests within the limit return 200', async () => {
    const app = buildApp({ limit: 3 })
    const agent = supertest(app)
    for (let i = 0; i < 3; i++) {
      const res = await agent.get('/test')
      expect(res.status).toBe(200)
    }
  })

  test('request exceeding the limit returns 429', async () => {
    const app = buildApp({ limit: 3 })
    const agent = supertest(app)
    // exhaust the limit
    for (let i = 0; i < 3; i++) {
      await agent.get('/test')
    }
    // this one should be rejected
    const res = await agent.get('/test')
    expect(res.status).toBe(429)
  })

  test('429 response body contains the configured message', async () => {
    const message = 'Too many login attempts, please try again later.'
    const app = buildApp({ limit: 1, message })
    const agent = supertest(app)
    await agent.get('/test') // consume the 1 allowed request
    const res = await agent.get('/test')
    expect(res.status).toBe(429)
    expect(res.text).toContain(message)
  })

  test('RateLimit-Limit header is present on responses', async () => {
    const app = buildApp({ limit: 5 })
    const agent = supertest(app)
    const res = await agent.get('/test')
    expect(res.status).toBe(200)
    // express-rate-limit v7 sends legacy X-RateLimit-* headers by default
    expect(res.headers).toHaveProperty('x-ratelimit-limit')
  })
})
