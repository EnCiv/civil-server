'use strict'
import Log from '../../models/log'

// Returns an appender function for the custom logger (see logger.js).
// source: 'node' | 'browser'
//
// loggingEvent: { level: string, startTime: Date, data: Array }
export function createMongoAppender(source) {
  return function mongoAppender(loggingEvent) {
    Log.create({
      startTime: loggingEvent.startTime,
      source,
      level: loggingEvent.level,
      data: loggingEvent.data,
    })
  }
}

// ---------------------------------------------------------------------------
// log4js compatibility shim (used by the tests in __tests__/mongo-logger.js
// which still wire up log4js directly to verify the pipeline end-to-end).
// Keep these so the existing tests don't need to change.
// ---------------------------------------------------------------------------
function mongologgerAppender(layout, timezoneOffset, source) {
  return function (loggingEvent) {
    Log.create({
      startTime: loggingEvent.startTime,
      source,
      level: loggingEvent.level.levelStr.toLowerCase(),
      data: loggingEvent.data,
    })
  }
}

function configure(config) {
  return mongologgerAppender(null, config.timezoneOffset, config.source || '')
}

export { mongologgerAppender as appender, configure }
export default { appender: mongologgerAppender, configure, createMongoAppender }

