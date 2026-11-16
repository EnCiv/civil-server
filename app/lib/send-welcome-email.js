'use strict'

import { SibGetTemplateId, SibSendTransacEmail, brevoDefaultFromEmail } from './send-in-blue-transactional'
import path from 'path'

let templateId

export default async function sendWelcomeEmail(toAddress) {
  if (!templateId) {
    templateId = await SibGetTemplateId(path.resolve(__dirname, '../../assets/email-templates/welcome-signup.html'))
    if (!templateId) {
      logger.error('welcome-signup template not found')
      return false
    }
  }

  const result = await SibSendTransacEmail({
    to: [{ email: toAddress }],
    sender: {
      name: 'EnCiv.org',
      email: brevoDefaultFromEmail,
    },
    templateId,
    tags: ['welcome-signup'],
  })
  if (!result || !result.messageId) {
    logger.error('welcome-signup email failed')
    return false
  }
  return true
}