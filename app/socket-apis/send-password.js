'use strict'

import User from '../models/user'
import { SibGetTemplateId, SibSendTransacEmail } from '../tools/send-in-blue-transactional'

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
  console.log('template id found: ', templateId)

  // todo change protocol
  const resetPasswordUrl = `http://${host}/resetPassword?t=${activationToken}&p=${returnToPath}`

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

  console.log('about to send email: ', messageProps)
  const result = await SibSendTransacEmail(messageProps)
  console.log('send result:', result)
  if (!result || !result.messageId) {
    logger.error('resetPassword email failed')
  }
  return !!result
}

async function sendPassword(email, returnTo, cb) {
  console.log('send-password called')
  const { host } = this.handshake.headers

  await User.findOne({ email })
    .then(async user => {
      if (!user) {
        logger.warn('no user found with email:', email)
        cb({ error: 'User not found' })
      } else {
        console.log('user found. doing stuff', user)
        user = await user.generateTokenAndKey()
        console.log('after update', user)

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
  console.log('done resetting')
  cb()
}

export default sendPassword
