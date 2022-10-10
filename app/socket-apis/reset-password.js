'use strict'

import User from '../models/user'

async function resetPassword(activationKey, activationToken, newPassword, cb) {
  try {
    console.log('reset pw socket', activationKey, activationToken, newPassword)
    await User.resetPassword(activationKey, activationToken, newPassword)
  } catch (error) {
    logger.error('error resetting password: ', error.toString())
    cb('error resetting password: ' + error)
  }
  cb()
}

export default resetPassword
