'use strict'

import User from '../models/user'
import { SibGetTemplateId, SibSendTransacEmail, brevoDefaultFromEmail } from '../lib/send-in-blue-transactional'
import path from 'path'

const DEFAULT_EMAIL_TYPE = 'reset'
const emailVariants = {
  reset: { template: 'reset-password' },
  welcome: { template: 'welcome-password' },
}
const templateIds = {}

async function sendResetPasswordEmail(host, toAddress, activationKey, activationToken, returnToPath, emailType) {
  logger.debug('sending password reset email to ', toAddress)
  const variant = emailVariants[emailType] || emailVariants[DEFAULT_EMAIL_TYPE]
  const templateName = variant.template
  if (!templateIds[templateName]) {
    templateIds[templateName] = await SibGetTemplateId(
      path.resolve(__dirname, `../../assets/email-templates/${templateName}.html`)
    )
    if (!templateIds[templateName]) {
      logger.error(`${templateName} template not found`)
      return false
    }
  }
  logger.debug('template id found: ', templateIds[templateName])

  const protocol = host.includes('localhost') ? 'http' : 'https'
  const resetPasswordUrl = `${protocol}://${host}/resetPassword?t=${activationToken}&p=${returnToPath}`

  const messageProps = {
    to: [{ email: toAddress }],
    sender: {
      name: 'EnCiv.org',
      email: brevoDefaultFromEmail,
    },
    templateId: templateIds[templateName],
    tags: [templateName],
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

// Options: returnTo is the redirect path; emailType is 'reset' or 'welcome' and defaults to 'reset'.
// A string returnTo is also accepted for existing callers.
async function sendPassword(email, options, cb) {
  if (typeof options === 'string') options = { returnTo: options }
  const { returnTo, emailType = DEFAULT_EMAIL_TYPE } = options || {}
  const selectedEmailType = emailVariants[emailType] ? emailType : DEFAULT_EMAIL_TYPE

  const { host } = this.handshake.headers

  await User.findOne({ email })
    .then(async user => {
      if (!user) {
        logger.warn('no user found with email:', email)
        cb({ error: 'User not found' })
      } else {
        logger.debug('user found. generating token and key')
        user = await User.generateTokenAndKey(user)

        const sendResetSuccess = await sendResetPasswordEmail(
          host,
          email,
          user.activationKey,
          user.activationToken,
          returnTo,
          selectedEmailType
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
