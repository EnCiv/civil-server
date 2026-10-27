'use strict'

import User from '../models/user'

async function checkResetToken(activationToken, cb) {
  try {
    const expired = await User.isResetTokenExpired(activationToken)
    cb(null, expired)
  } catch (error) {
    logger.error('error checking reset token: ', error.toString())
    cb(error.toString())
  }
}

export default checkResetToken
