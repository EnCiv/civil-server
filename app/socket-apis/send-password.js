'use strict'

import User from '../models/user'
// import sendEmail from '../server/util/send-email'
import configValues from '../../public.json'

// todo convert this into SendInBlue
const EMAIL_TEMPLATE =
  'Hello,\r\n\r\n' +
  'You are receiving this email because you requested a password reset.\r\n\r\n' +
  'Your reset key is:\r\n\r\n' +
  '\t{key}\r\n\r\n' +
  'To reset your password, copy the reset key above and go to {url}\r\n\n\n' +
  'Thank you,\n' +
  'EnCiv'

async function sendPassword(email, returnTo, cb) {
  console.log('send-password called')
  const { host } = this.handshake.headers

  function emailBody(key, token) {
    return EMAIL_TEMPLATE.replace(/\{key}/g, key).replace(
      /\{url}/g,
      `http://${host}/resetPassword?t=${token}&p=${returnTo}`
    )
  }

  await User.findOne({ email })
    .then(async user => {
      if (!user) {
        logger.warn('no user found with email:', email)
        cb({ error: 'User not found' })
      } else {
        console.log('user found. doing stuff', user)
        user = await user.generateTokenAndKey()
        console.log('after update', user)
        // await user.resetPassword('SkRlnvrXLGJu', 'QqIYMKH6wjyk', 'newPassword')
        console.log({
          from: configValues.sendEmailFrom,
          to: email,
          subject: 'Reset password',
          text: emailBody(user.activationKey, user.activationToken),
        })
      }
    })
    .catch(error => cb({ error: error.message }))
  console.log('done resetting')
  cb()
}

export default sendPassword
