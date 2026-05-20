'use strict'
// Thin custom logger — replaces the log4js dependency.
//
// API:
//   import { createLogger } from './logger'
//   const myLogger = createLogger([appender1, appender2, ...])
//   myLogger.info('message', extraData)
//   myLogger.error(someDate, 'message', moreData)  // first arg may be a Date (startTime override)
//
// A loggingEvent passed to each appender is:
//   { level: 'info'|'warn'|'error'|'debug'|'trace', startTime: Date, data: Array }
//
// Typically used by setting a global:
//   global.logger  = createLogger([nodeMongoAppender])
//   global.bslogger = createLogger([browserMongoAppender])
//   window.logger  = createLogger([bconsoleAppender, socketloggerAppender])

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error']

export function createLogger(appenders = []) {
  const logger = {}
  for (const level of LEVELS) {
    logger[level] = function (...args) {
      // Allow an optional Date as the first argument to override startTime
      // (used by bslogger when replaying a browser event that already has a startTime).
      let startTime
      let data
      if (args[0] instanceof Date) {
        startTime = args[0]
        data = args.slice(1)
      } else {
        startTime = new Date()
        data = args
      }
      const event = { level, startTime, data }
      for (const appender of appenders) {
        try {
          appender(event)
        } catch (e) {
          // Never let an appender crash the caller.
          // eslint-disable-next-line no-console
          console.error('logger appender threw:', e)
        }
      }
    }
  }
  return logger
}

export default createLogger
