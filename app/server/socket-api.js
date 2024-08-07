'use strict'

import SocketIO from 'socket.io'
import cookieParser from 'cookie-parser'
import ss from '@sap_oss/node-socketio-stream'
import User from '../models/user'

import fetchHandlers from './util/fetch-handlers'

// this is not catching the errors from hartford-address-lookup when there is not MAPS Api set - but still maybe it will catch some other error
function handlerWrapper(handler, handle, ...args) {
  try {
    handler.apply(this, args)
  } catch (error) {
    logger.error('caught error from api handler', handle, error.message, 'continuing', error)
  }
}

function handlerStreamWrapper(handler, handle, ...args) {
  try {
    handler.call(this, ...args)
  } catch (error) {
    logger.error('caught error from stream api handler', handle, error.message, 'continuing', error)
  }
}

class API {
  constructor() {
    this.users = []
    this.handlers = {}
    this.sockets = []
  }

  //path.resolve(__dirname, '../api')
  addDirectory(dirPath) {
    return new Promise(async (ok, ko) => {
      try {
        await fetchHandlers(dirPath, this.handlers)
        return ok()
      } catch (error) {
        logger.error('api.addSockeAPIsDirtectory caught error:', error)
        ko(error)
      }
    })
  }

  disconnect() {
    return new Promise((ok, ko) => {
      if (!this.sockets.length) return ok()
      const promises = this.sockets.map(
        socket =>
          new Promise((ok, ko) => {
            if (!socket.connected) return ok()
            socket.on('disconnect', ok).disconnect(true)
          })
      )
      Promise.all(promises).then(ok, ko)
    })
  }

  start(server) {
    return new Promise(async (ok, ko) => {
      try {
        this.io = SocketIO(server)
        //server.listen
        logger.info('socketIO listening')
        this.io
          .use(this.identify.bind(this))
          .on('connection', this.connected.bind(this))
          .on('connect_error', error => {
            logger.error('socket io connection_error', error, this)
          })
          .on('connect_timeout', error => {
            logger.error('socket io connection_timeout', error, this)
          })
          .on('error', err => logger.error('socketAPI server caught error', err))
        ok()
      } catch (error) {
        logger.error('API start caught error', error)
        ko(error)
      }
    })
  }

  async validateUserCookie(cookie, ok, ko) {
    if (this.users.some(user => user.id === cookie.id)) return ok()
    else {
      let usr = await User.findOne({ _id: new User.ObjectId(cookie.id) })
      if (!usr) {
        logger.error(`API:validateUserCookie id ${cookie.id} not found in this server/db`)
        if (ko) return ko()
      } else {
        this.users.push(cookie)
        return ok()
      }
    }
  }

  /** Identify client
   *  @arg      {Socket} socket
   *  @arg      {Function} next
   */

  identify(socket, next) {
    try {
      const req = {
        headers: {
          cookie: socket.request.headers.cookie,
        },
      }

      cookieParser()(req, null, () => {})

      let cookie = req.cookies.synuser

      if (cookie) {
        if (typeof cookie === 'string') {
          cookie = JSON.parse(cookie)
        }
        this.validateUserCookie(
          cookie,
          () => {
            socket.synuser = cookie
            next()
          },
          () => {
            next(new Error(`API: User id ${cookie.id} not found in this server/db`))
          }
        )
      } else next()
    } catch (error) {
      logger.info('API.identify caught error', error)
    }
  }

  /** On every client's connection
   *  @arg      {Socket} socket
   */

  connected(socket) {
    try {
      this.sockets.push(socket)

      socket.on('error', error => logger.error('API.connected socket got error event', error))
      socket.on('connect_timeout', error => logger.error('socket connected timeout', error))
      socket.on('connect_error', error => logger.error('socket connect_error', error))
      socket.on('disconnect', () => {})
      socket.emit('welcome', socket.synuser)
      socket.broadcast.emit('online users', this.users.length)
      socket.emit('online users', this.users.length)
      logger.trace('socket connected', { id: socket.id, synuser: socket.synuser, onlineUsers: this.users.length })

      socket.ok = (event, ...responses) => {
        logger.trace('api: connected: socket.ok ', event, ...responses)
        socket.emit('OK ' + event, ...responses)
      }

      var ssSocket

      for (let handle in this.handlers) {
        if (handle.endsWith('development') && process.env.NODE_ENV !== 'development') continue // ignore handlers that end with "development" in production
        if (handle.startsWith('stream')) {
          if (!ssSocket) {
            ssSocket = ss(socket)
            ssSocket.on('error', err => logger.error('socket-api ssSocket error', err))
            ssSocket.on('uncaughtException', err => logger.error('socket uncaught', err))
            ssSocket.on('close', () => console.error('got close'))
          }
          // handlers that use streams need to start with 'stream' and they are wrapped differently to work
          ssSocket.on(handle, handlerStreamWrapper.bind(ssSocket, this.handlers[handle], handle))
        } else socket.on(handle, handlerWrapper.bind(socket, this.handlers[handle], handle))
      }
      // thanks to https://stackoverflow.com/questions/41751141/socket-io-how-to-access-unhandled-messages
      socket.conn.on('message', msg => {
        if (msg === '1') {
          // this is what you get when a connection is being closed - ignore it
        } else if (typeof msg === 'string' && !Object.keys(socket._events).includes(msg.split('"')[1])) {
          logger.error(`WARNING: Unhandled Socket API Event: ${msg}`)
        } else if (typeof msg !== 'string' && !msg instanceof Buffer) {
          //streams come across as Buffers - don't error on that
          logger.error('Warning Unhandles Socket API event not a string or Buffer', msg)
        }
      })
    } catch (error) {
      logger.error('api.connected caughet error', error)
    }
  }
}

export default API
