'use strict'

function socketlogger(loggingEvent) {
  loggingEvent.data.push({ socketId: this.id, userId: this.synuser ? this.synuser.id : 'anonymous' })
  const level = typeof loggingEvent.level === 'string' ? loggingEvent.level : loggingEvent.level.levelStr.toLowerCase()
  bslogger[level](loggingEvent.startTime, ...loggingEvent.data)
}

export default socketlogger
