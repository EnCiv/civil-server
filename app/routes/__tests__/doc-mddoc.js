/**
 * Tests for the /doc/:mddoc markdown route (doc-mddoc.js).
 * The handler reads an .md file from assets/md/, parses it with marked v12,
 * and returns rendered HTML.
 *
 * Uses supertest against a minimal express app with the route registered the
 * same way the civil server does — via the exported function called with a
 * context object whose `.app` property is the express instance.
 */

import express from 'express'
import supertest from 'supertest'
import getMarkDown from '../doc-mddoc'

// dummy out logger for tests
if (!global.logger) {
  global.logger = console
}

function buildApp() {
  const app = express()
  getMarkDown.call({ app })
  return app
}

describe('GET /doc/:mddoc', () => {
  test('returns 200 and HTML for an existing document', async () => {
    const res = await supertest(buildApp()).get('/doc/civil-server')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
  })

  test('rendered HTML contains expected heading tag', async () => {
    const res = await supertest(buildApp()).get('/doc/civil-server')
    expect(res.text).toMatch(/<h1[^>]*>/)
    expect(res.text).toContain('civil-server')
  })

  test('rendered HTML contains a table element', async () => {
    const res = await supertest(buildApp()).get('/doc/civil-server')
    expect(res.text).toMatch(/<table/)
  })

  test('returns 404 for a document that does not exist', async () => {
    const res = await supertest(buildApp()).get('/doc/nonexistent-document')
    expect(res.status).toBe(404)
    expect(res.text).toContain('not found')
  })

  test('returns 400 for a document name with path-traversal characters', async () => {
    const res = await supertest(buildApp()).get('/doc/..%2Fapp%2Fmodels%2Fuser')
    expect(res.status).toBe(400)
  })

  test('returns 400 for a document name containing a slash', async () => {
    const res = await supertest(buildApp()).get('/doc/sub/dir')
    // express parses this as a different route, so 404 is also acceptable
    expect([400, 404]).toContain(res.status)
  })
})
