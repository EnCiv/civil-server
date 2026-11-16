'use strict'

import User from '../models/user'
import messages from '../lib/reset-password-messages'

async function checkResetToken(activationToken, cb) {
  try {
    const { expired, code } = await User.checkResetToken(activationToken)
    cb({ success: true, expired, code, message: code && messages[code] })
  } catch (error) {
    logger.error('unexpected error checking reset token: ', error.toString())
    cb({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
  }
}

export default checkResetToken
