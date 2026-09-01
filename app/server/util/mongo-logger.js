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

export default { createMongoAppender }

