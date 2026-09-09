// Tests for the Brevo-prefixed API names (brevo-transactional.js).
// brevo-transactional.js is a thin re-export module; these tests confirm that
// each Brevo* name is the exact same function reference as its Sib* counterpart.
// Live API behaviour is tested in send-in-blue-transactional.js.
import { expect, test, describe, jest } from '@jest/globals'

// global.logger must be set before requiring modules that use it at load time
global.logger = { ...console }
global.logger.error = jest.fn((...args) => args)
global.logger.warn = jest.fn((...args) => args)

const { BrevoGetTemplateId, BrevoDeleteSmtpTemplate, BrevoSendTransacEmail } = require('../brevo-transactional')
const { SibGetTemplateId, SibDeleteSmtpTemplate, SibSendTransacEmail } = require('../send-in-blue-transactional')

describe('brevo-transactional re-exports', () => {
  test('BrevoGetTemplateId is the same function as SibGetTemplateId', () => {
    expect(BrevoGetTemplateId).toBe(SibGetTemplateId)
  })
  test('BrevoDeleteSmtpTemplate is the same function as SibDeleteSmtpTemplate', () => {
    expect(BrevoDeleteSmtpTemplate).toBe(SibDeleteSmtpTemplate)
  })
  test('BrevoSendTransacEmail is the same function as SibSendTransacEmail', () => {
    expect(BrevoSendTransacEmail).toBe(SibSendTransacEmail)
  })
})
