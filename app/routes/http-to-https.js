'use strict'
import os from 'os'
import net from 'net'

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number)
  return (
    parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
  )
}

function isHostOnLan(hostname) {
  // so we can access the server from the LAN while in development - but not in production like http://192.168.1.6:3011

  if (process.env.NODE_ENV !== 'development') return false

  // Check for localhost or loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true

  // Check if hostname is a valid IPv4 address
  if (!net.isIP(hostname)) return false

  // If it's a private IPv4, check if server has an interface on the same subnet
  if (isPrivateIPv4(hostname)) {
    const interfaces = os.networkInterfaces()
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal && isPrivateIPv4(addr.address)) {
          // For 192.168.x.x, check if first 3 octets match (i.e., /24 subnet)
          if (addr.address.split('.').slice(0, 3).join('.') === hostname.split('.').slice(0, 3).join('.')) {
            return true
          }
          // For 10.x.x.x, check if first octet matches (i.e., /8 subnet)
          if (addr.address.startsWith('10.') && hostname.startsWith('10.')) {
            return true
          }
          // For 172.16-31.x.x, check if first 2 octets match (i.e., /16 subnet)
          if (
            addr.address.startsWith('172.') &&
            hostname.startsWith('172.') &&
            addr.address.split('.')[1] === hostname.split('.')[1]
          ) {
            return true
          }
        }
      }
    }
  }

  return false
}
export default function httpToHttps() {
  this.app.use((req, res, next) => {
    let hostName = req.hostname
    if (isHostOnLan(hostName)) return next() //so we can access from the LAN
    if (!req.secure || req.protocol !== 'https') {
      if (process.env.NODE_ENV !== 'production')
        console.info('server.httpToHttps redirecting to ', req.secure, 'https://' + req.hostname + req.url)
      res.redirect('https://' + req.hostname + req.url)
    } else next() /* Continue to other routes if we're not redirecting */
  })
}
