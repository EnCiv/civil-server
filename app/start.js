#!/usr/bin/env node

'use strict'

import dns from 'dns'
import theCivilServer from './server/the-civil-server'
import Iota from './models/iota'
import iotas from '../iotas.json'
import App from './components/app'

// Node 20 updated c-ares; on Windows it may use a loopback DNS (127.0.0.1 or ::1) from
// a VPN/Docker DNS proxy that doesn't handle SRV queries the way Node 20's c-ares expects,
// causing ECONNREFUSED when the MongoDB driver resolves mongodb+srv:// hostnames.
// Replace loopback DNS addresses with public DNS servers before connecting.
const GOOGLE_PUBLIC_DNS_PRIMARY = '8.8.8.8'
const GOOGLE_PUBLIC_DNS_SECONDARY = '8.8.4.4'
;(function fixLoopbackDNSForNode20() {
  const servers = dns.getServers()
  const nonLoopback = servers.filter(s => !s.startsWith('127.') && s !== '::1' && s !== '[::1]')
  if (nonLoopback.length < servers.length) {
    const fixed = nonLoopback.length > 0 ? nonLoopback : [GOOGLE_PUBLIC_DNS_PRIMARY, GOOGLE_PUBLIC_DNS_SECONDARY]
    console.warn('civil-server: replaced loopback DNS with public DNS for Node 20 c-ares / mongodb+srv fix', {
      original: servers,
      using: fixed,
    })
    dns.setServers(fixed)
  }
})()

Iota.preload(iotas)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
async function start() {
  try {
    const server = new theCivilServer()
    server.App = App
    await server.earlyStart()
    await server.start()
    logger.info('started')
  } catch (error) {
    logger.error('error on start', error)
  }
}

start()
