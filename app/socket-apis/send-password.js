'use strict'

import User from '../models/user'
import { SibGetTemplateId, SibSendTransacEmail } from '../lib/send-in-blue-transactional'

let templateId

async function sendResetPasswordEmail(host, toAddress, activationKey, activationToken, returnToPath) {
  logger.debug('sending password reset email to ', toAddress)
  if (!templateId) {
    templateId = await SibGetTemplateId('reset-password')
    if (!templateId) {
      logger.error('reset-password template not found')
      return false
    }
  }
  logger.debug('template id found: ', templateId)

  const protocol = host.includes('localhost') ? 'http' : 'https'
  const resetPasswordUrl = `${protocol}://${host}/resetPassword?t=${activationToken}&p=${returnToPath}`

  const messageProps = {
    to: [{ email: toAddress }],
    sender: {
      name: 'EnCiv.org',
      email: process.env.SENDINBLUE_DEFAULT_FROM_EMAIL,
    },
    templateId,
    tags: ['reset-password'],
    params: {
      resetPasswordUrl: resetPasswordUrl,
      activationKey: activationKey,
    },
  }

  logger.debug('about to send email')
  const result = await SibSendTransacEmail(messageProps)
  if (!result || !result.messageId) {
    logger.error('resetPassword email failed')
  }
  return !!result
}

async function sendPassword(email, returnTo, cb) {
  const { host } = this.handshake.headers

  await User.findOne({ email })
    .then(async user => {
      if (!user) {
        logger.warn('no user found with email:', email)
        cb({ error: 'User not found' })
      } else {
        logger.debug('user found. generating token and key')
        user = await user.generateTokenAndKey()

        const sendResetSuccess = await sendResetPasswordEmail(
          host,
          email,
          user.activationKey,
          user.activationToken,
          returnTo
        )
        if (!sendResetSuccess) {
          cb('error sending reset password email')
        }
      }
    })
    .catch(error => cb({ error: error.message }))
  cb()
}

export default sendPassword
