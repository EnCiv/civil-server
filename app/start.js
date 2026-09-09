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

// Register non-essential cookies here so enciv-cookies.js can build its consent modal from this list
// instead of hardcoding it - see app/components/enciv-cookies.js
// onAccepted/onRevoked only ever run in the browser (serialized via .toString() below) - never called here in Node.
const cookieDefinitions = [
  {
    name: 'Google Analytics',
    category: 'analytics',
    onAccepted: function () {
      if (!window.process || !window.process.env || !window.process.env.GOOGLE_ANALYTICS) return
      if (document.getElementById('googletagmanager')) return
      window.dataLayer = window.dataLayer || []
      window.gtag = function () {
        window.dataLayer.push(arguments)
      }
      window.gtag('js', new Date())
      window.gtag('config', window.process.env.GOOGLE_ANALYTICS)
      const script = document.createElement('script')
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + window.process.env.GOOGLE_ANALYTICS
      script.id = 'googletagmanager'
      script.async = true
      document.head.appendChild(script)
    },
    onRevoked: function () {
      ;['_ga', '_gid', '_gat'].forEach(function (name) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      })
      delete window.dataLayer
      delete window.gtag
      const gtmElement = document.getElementById('googletagmanager')
      if (gtmElement) gtmElement.remove()
    },
  },
  {
    name: 'Test Cookie 1',
    category: 'analytics',
    onAccepted: function () {},
    onRevoked: function () {},
  },
  {
    name: 'Test Cookie 2',
    category: 'analytics',
    onAccepted: function () {},
    onRevoked: function () {},
  },
].filter(({ name }) => !name.toLowerCase().startsWith('test') || process.env.NODE_ENV === 'development')

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
async function start() {
  try {
    const server = new theCivilServer()
    server.App = App
    // onAccepted/onRevoked run in the browser (via CConsentStyleHelmet), not on the server.
    for (const { name, category, onAccepted, onRevoked } of cookieDefinitions) {
      server.addCookie({ name, category, onAccepted: `(${onAccepted.toString()})();`, onRevoked: `(${onRevoked.toString()})();` })
    }
    await server.earlyStart()
    await server.start()
    logger.info('started')
  } catch (error) {
    logger.error('error on start', error)
  }
}

start()
