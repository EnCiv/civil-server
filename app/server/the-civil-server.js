'use strict'
// named the-civil-server.js because web-pack-dev.js needs to IgnorePlugin it, and server.js is used many other times.  Also - IgnorePlugin - contextRegExp not working in combination with resourceRegExp
import http from 'http'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import compression from 'compression'
import SocketAPI from './socket-api'
import setUserCookie from './routes/set-user-cookie'
import serverReactRender from './routes/server-react-render'
import fetchHandlers from './util/fetch-handlers'
import serverEvents from './server-events'
import { createLogger } from './util/logger'
import { createMongoAppender } from './util/mongo-logger'
import { Mongo } from '@enciv/mongo-collections'
import path from 'path'
import App from '../components/app'
import { mergeWith } from 'lodash'

if (!global.logger) {
  const nodeMongoAppender = createMongoAppender('node')
  const browserMongoAppender = createMongoAppender('browser')

  // ANSI codes for stderr formatting (terminals that don't support them just show the text).
  const _Reset = '\x1b[0m'
  const _Bright = '\x1b[1m'
  const _FgRed = '\x1b[31m'
  const _FgYellow = '\x1b[33m'
  const _levelColor = { error: _FgRed + _Bright, warn: _FgYellow + _Bright }

  // Write all events to stderr so they appear in server logs / Heroku logstream.
  function createStderrAppender(source) {
    return function stderrAppender(event) {
      const d = event.startTime.toString().split(' ')
      const ts = d[3] + d[1] + d[2] + ' ' + d[4]
      const col = _levelColor[event.level] || _Bright
      const header = `${col}${ts} ${source} ${event.level}${_Reset}`
      const body = event.data.map(x => (typeof x === 'object' ? JSON.stringify(x, null, 2) : x)).join(' ')
      process.stderr.write(`${header} ${body}\n`)
    }
  }

  // bslogger stands for browser socket logger - not BS logger.
  global.bslogger = createLogger([createStderrAppender('browser'), browserMongoAppender])
  global.logger = createLogger([createStderrAppender('node'), nodeMongoAppender])
}

class HttpServer {
  constructor() {
    // these are the directive requited for helment conntent security below
    this.contentSecurityPolicy = {
      reportOnly: false,
      directives: {
        defaultSrc: ["'self'"],
        childSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          '*.googletagmanager.com',
          'webrtc.github.io',
          '*.google-analytics.com',
        ],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          '*.googletagmanager.com',
          'webrtc.github.io',
          '*.google-analytics.com',
        ],
        fontSrc: ["'self'", '*.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", '*.googleapis.com'],
        imgSrc: ["'self'", '*.cloudinary.com', 'enciv.org', '*.google-analytics.com'],
        mediaSrc: ["'self'", '*.cloudinary.com', 'blob:', 'mediastream:'],
        connectSrc: ["'self'", '*.google-analytics.com'],
        frameSrc: ["'self'", 'docs.google.com'],
      },
    }
    this.directives = {
      // in the future this should go away in favor of this.contentSecuirtyPolicy.directives
      defaultSrc: [],
      childSrc: [],
      scriptSrc: [],
      scriptSrcElem: [],
      fontSrc: [],
      styleSrc: [],
      imgSrc: [],
      mediaSrc: [],
      connectSrc: [],
      frameSrc: [],
    }
    if (process.env.NODE_ENV === 'development') this.contentSecurityPolicy.directives.scriptSrc.push("'unsafe-eval'") // used in development on webpack
    this.routeHandlers = {}
    this.routesDirPaths = [path.resolve(__dirname, '../routes')]
    this.serverEventsDirPaths = [path.resolve(__dirname, '../events')]
    this.socketAPIsDirPaths = [path.resolve(__dirname, '../socket-apis')]
    this.App = App
    this.setUserCookie = setUserCookie.bind(this) // user cookie needs this context so it doesn't have to lookup users in the DB every time
    this.socketAPI = new SocketAPI()
    if (process.listeners('uncaughtException') === 0) {
      process.on('uncaughtException', err => {
        logger.error('theCivliServer: Uncaught Exception thrown\n', err, '\ncontinuing')
      })
    }
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
      // Log the error or handle it as needed
    })
  }

  addRoutesDirectory(dirPath) {
    return new Promise(async (ok, ko) => {
      try {
        await fetchHandlers(dirPath, this.routeHandlers)
        ok()
      } catch (error) {
        logger.error('sever.addRoutesDirectory caught error:', error)
        ko(error)
      }
    })
  }

  processRouteHandlers() {
    for (const [handle, handler] of Object.entries(this.routeHandlers)) {
      try {
        handler.apply(this)
      } catch (error) {
        logger.error('server.processRouteHandlers caught error:', handle, error)
      }
    }
  }

  earlyStart() {
    return new Promise(async (ok, ko) => {
      // heroku is going to delete the MONGODB_URI var on Nov10 - we need something else to use in the mean time
      const MONGODB_URI = process.env.PRIMARYDB_URI || process.env.MONGODB_URI
      if (!MONGODB_URI) ko(new Error('Missing PRIMARYDB_URI or MONGODB_URI'))
      await Mongo.connect(MONGODB_URI)
      return ok()
    })
  }
  // a minute after a request has been received, check and see if the response has been sent.
  timeout() {
    this.app.use((req, res, next) => {
      setTimeout(() => {
        if (!res.headersSent) {
          logger.error('timeout headersSent:', res.headersSent, 'originalUrl', req.originalUrl, 'ip', req.ip)
          next(new Error('Test error > timeout headers not sent'))
        }
      }, 1000 * 29)
      next()
    })
  }

  notFound() {
    const serverReactRenderApp = serverReactRender.bind(null, this.App)
    this.app.use((req, res, next) => {
      res.statusCode = 404
      req.notFound = true
      next()
    }, serverReactRenderApp)
  }

  error() {
    const serverReactRenderApp = serverReactRender.bind(null, this.App)
    this.app.use((error, req, res, next) => {
      logger.error('server caught error', error)
      res.statusCode = 500
      res.locals.error = error
      next()
    }, serverReactRenderApp)
  }

  start() {
    return new Promise(async (ok, ko) => {
      try {
        await this.addRoutesDirectory(this.routesDirPaths)
        await this.socketAPI.addDirectory(this.socketAPIsDirPaths)
        await serverEvents.addDirectory(this.serverEventsDirPaths)
        this.app = express()
        this.app.set('port', +(process.env.PORT || 3012))
        this.app.use(compression())
        this.app.use(helmet.hidePoweredBy({ setTo: 'Powered by Ruby on Rails.' }))
        if (this.contentSecurityPolicy)
          this.app.use(
            helmet.contentSecurityPolicy(
              mergeWith(this.contentSecurityPolicy, { directives: this.directives }, (o, s) =>
                Array.isArray(o) ? o.concat(s) : undefined
              )
            )
          )
        this.app.use(express.urlencoded({ extended: true }), express.json(), express.text())
        this.app.use(cookieParser())
        this.app.use(
          '/assets/',
          express.static('assets', {
            maxAge:
              process.env.NODE_ENV === 'production' && !process.env.HOSTNAME.includes('localhost')
                ? process.env.ASSETS_MAX_AGE || 1 * 24 * 60 * 60 * 1000
                : 0,
          })
        ) // max-age in ms - 1 days these things only change through development
        this.app.enable('trust proxy')
        this.processRouteHandlers()
        this.notFound()
        this.error()
        this.server = http.createServer(this.app)
        this.server.timeout = 3 * 60 * 1000
        this.server.on('error', error => {
          logger.error('server caught error', error)
        })
        this.server.listen(process.env.PORT || 3012, async () => {
          logger.info('Server is listening', {
            port: this.app.get('port'),
            env: this.app.get('env'),
          })
          await this.socketAPI.start(this.server)
          console.info('SocketAPI started')
          await serverEvents.start()
          return ok()
        })
      } catch (error) {
        console.error('Server caught error trying to start', error)
      }
    })
  }

  stop() {
    return new Promise((ok, ko) => {
      this.socketAPI.disconnect().then(() => {
        this.server.close(ok)
      }, ko)
    })
  }
}

export default HttpServer
