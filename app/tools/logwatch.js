#!/usr/bin/env node
'use strict'

import dns from 'dns'
import Log from '../models/log'
import { Mongo } from '@enciv/mongo-collections'

// Node 20 c-ares may use a loopback DNS server (from a VPN/Docker proxy) that
// doesn't handle mongodb+srv:// SRV queries correctly.  Mirror the fix from start.js.
const GOOGLE_PUBLIC_DNS_PRIMARY = '8.8.8.8'
const GOOGLE_PUBLIC_DNS_SECONDARY = '8.8.4.4'
;(function fixLoopbackDNSForNode20() {
  const servers = dns.getServers()
  const nonLoopback = servers.filter(s => !s.startsWith('127.') && s !== '::1' && s !== '[::1]')
  if (nonLoopback.length < servers.length) {
    const fixed = nonLoopback.length > 0 ? nonLoopback : [GOOGLE_PUBLIC_DNS_PRIMARY, GOOGLE_PUBLIC_DNS_SECONDARY]
    dns.setServers(fixed)
  }
})()

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
  error: FgRed + Bright,
  warn: FgYellow + Bright,
  debug: FgCyan + Bright,
  info: Bright,
  trace: Dim,
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
  if (!args.db) {
    console.error('Error: no database URI provided. Pass it as: logwatch db <URI>')
    console.error('Example: node dist/tools/logwatch.js db $MONGODB_URI')
    console.error('(Check that $MONGODB_URI is exported in your shell, e.g. via the dbup alias)')
    process.exit(1)
  }
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
        const d = log.startTime.toString().split(' ')
        const ts = d[3] + d[1] + d[2] + ' ' + d[4]
        const header = colorLevel[log.level] + ts + ' ' + log.source + ' ' + log.level + Reset
        const body = log.data.map(x => (typeof x === 'object' ? JSON.stringify(x, null, 2) : x)).join(' ')
        console.log(header, body)
      })
      let date = logs[logs.length - 1].startTime
      const mill = date.getMilliseconds() + 1
      date.setMilliseconds(mill)
      array[0].$match.startTime = { $gt: date }
    } else {
      process.stdout.write('.')
      pollcount++
    }
    await new Promise((ok, ko) => setTimeout(ok, 10000))
  }
}
main()
