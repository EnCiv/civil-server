'use strict'

import User from '../models/user'
import messages from '../lib/reset-password-messages'

async function resetPassword(activationToken, activationKey, newPassword, cb) {
  try {
    const result = await User.resetPassword(activationToken, activationKey, newPassword)
    if (!result.success) {
      logger.warn('reset-password rejected: ', result.code)
      cb({ success: false, code: result.code, message: messages[result.code] })
      return
    }
    cb({ success: true })
  } catch (error) {
    logger.error('unexpected error resetting password: ', error.toString())
    cb({ success: false, code: 'GENERIC_RESET_ERROR', message: messages.GENERIC_RESET_ERROR })
  }
}

export default resetPassword
