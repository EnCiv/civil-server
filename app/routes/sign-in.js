'use strict'

import User from '../models/user'
import expressRateLimit from 'express-rate-limit'
import sendUserId from '../server/util/send-user-id'

const env = process.env.NODE_ENV || 'development'

async function signIn(req, res, next) {
  try {
    const { password, ..._body } = req.body // don't let the password appear in the logs
    logger.info({ signIn: _body })
    let { email } = req.body
    if (!email) {
      res.statusCode = 400
      res.json({ error: 'Missing email' })
    } else if (!password) {
      res.statusCode = 400
      res.json({ error: 'Missing password' })
    } else {
      try {
        var user = await User.findOne({ email })
        if (!user) {
          res.statusCode = 404
          res.json({ 'user/password error': email })
        }
        const validated = await user.validatePassword(password)
        if (!validated) {
          res.statusCode = 404
          res.json({ 'user/password error': email })
        } else {
          delete user.password
          req.user = user
          var newInfo = {}
          let needsUpdate = false
          Object.keys(_body).forEach(k => {
            if (k === 'email') return
            if (_body[k] !== user[k]) {
              newInfo[k] = _body[k]
              needsUpdate = true
            }
          })
          if (needsUpdate) {
            // update is done in the background - no waiting for success or failure
            User.updateOne({ _id: user._id }, newInfo).catch(err => {
              logger.error('sign_in trying to update user info failed', err, user, newInfo)
            })
          }
          next()
        }
      } catch (err) {
        next(err)
      }
    }
  } catch (error) {
    next(error)
  }
}

function route() {
  let signInAttemptWindow
  let signInWindowMessage
  if (env === 'development') {
    signInAttemptWindow = 60 * 1000
    signInWindowMessage = '60 seconds'
  } else {
    signInAttemptWindow = 24 * 60 * 60 * 1000
    signInWindowMessage = '24 hours'
  }
  const apiLimiter = expressRateLimit({
    windowMs: signInAttemptWindow,
    max: 2,
    message: 'Too many attempts logging in, please try again after ' + signInWindowMessage + '.',
  })
  this.app.post('/sign/in', apiLimiter, signIn, this.setUserCookie, sendUserId)
}
export default route
