#!/usr/bin/env node
'use strict'

import Log from '../models/log'
import { Mongo } from '@enciv/mongo-collections'

var start = new Date()
start.setDate(start.getDate() - 1) // start yesterday

// colors on bash console
const Reset = '\x1b[0m'
const Bright = '\x1b[1m'
const Dim = '\x1b[2m'
const Underscore = '\x1b[4m'
const Blink = '\x1b[5m'
const Reverse = '\x1b[7m'
const Hidden = '\x1b[8m'

const FgBlack = '\x1b[30m'
const FgRed = '\x1b[31m'
const FgGreen = '\x1b[32m'
const FgYellow = '\x1b[33m'
const FgBlue = '\x1b[34m'
const FgMagenta = '\x1b[35m'
const FgCyan = '\x1b[36m'
const FgWhite = '\x1b[37m'

const BgBlack = '\x1b[40m'
const BgRed = '\x1b[41m'
const BgGreen = '\x1b[42m'
const BgYellow = '\x1b[43m'
const BgBlue = '\x1b[44m'
const BgMagenta = '\x1b[45m'
const BgCyan = '\x1b[46m'
const BgWhite = '\x1b[47m'

const colorLevel = {
  error: FgRed + Reverse,
  warn: FgYellow + Reverse,
  debug: FgCyan,
  info: Reset,
  trace: Reset,
}

// fetch args from command line
var argv = process.argv
var args = { start }
if (argv.length <= 2) {
  console.info(
    'logwatch db (URI) start (backward-in-minutes) source (node|browser) level (info|warn|error) limit (number)'
  )
  process.exit(0)
}
for (let arg = 2; arg < argv.length; arg++) {
  switch (argv[arg]) {
    case 'db': // the mongo database URI
      args[argv[arg]] = argv[++arg]
      break
    case 'limit':
      args[argv[arg]] = parseInt(argv[++arg])
      break
    case 'start':
      args[argv[arg]] = new Date(new Date().getTime() - parseInt(argv[++arg]) * 60000)
      break
    case 'source':
    case 'level':
      args[argv[arg]] = argv[++arg]
      break
    default:
      console.error('ignoring unexpected argument:', argv[arg])
  }
}
async function main() {
  await Mongo.connect(args.db)
  console.log('Connected to server:', args.db)
  let start = args.start
  const array = [{ $match: { startTime: { $gt: start } } }, { $sort: { startTime: 1 } }]
  if (args.source) array[0].$match.source = args.source
  if (args.level) array[0].$match.level = args.level
  let pollcount = 0
  while (1) {
    const logs = await Log.aggregate(array).toArray()
    if (logs.length) {
      if (pollcount) {
        pollcount = 0
        console.log('\n')
      }
      logs.forEach(log => {
        console.log(
          colorLevel[log.level] + log.startTime.toLocaleTimeString(undefined, { timeStyle: 'short' }),
          log.source,
          log.level,
          Reset,
          JSON.stringify(log.data, null, 2)
        )
      })
      let date = logs[logs.length - 1].startTime
      const mill = date.getMilliseconds() + 1
      date.setMilliseconds(mill)
      array[0].$match.startTime = date
    } else {
      process.stdout.write('.')
      pollcount++
    }
    await new Promise((ok, ko) => setTimeout(ok, 10000))
  }
}
main()
