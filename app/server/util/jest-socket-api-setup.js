'use strict'
// Utilities for writing end-to-end socket-api tests in Jest.
//
// Usage:
//   import jestSocketApiSetup, { jestSocketApiTeardown } from 'civil-server/dist/server/util/jest-socket-api-setup'
//   // or, from within civil-server's own tests:
//   import jestSocketApiSetup, { jestSocketApiTeardown } from '../../server/util/jest-socket-api-setup'
//
//   beforeEach(async () => {
//     await jestSocketApiSetup(userId, [['my-handle', mySocketApiHandler]])
//   })
//   afterEach(() => jestSocketApiTeardown())
//
// After setup, window.socket is a real socket.io client connected to an in-process server.
// Each test gets its own server+client on a distinct port, so parallel tests don't collide.

import { jest } from '@jest/globals'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { WebSocketServer } from 'ws'
import clientIo from 'socket.io-client'

// Start above the common default range so we don't clash with running servers.
var SocketIoPort = 3100

/**
 * Spin up a real socket.io server+client pair for testing.
 *
 * @param {string} userId - Value placed on socket.synuser.id (the logged-in user).
 * @param {Array<[string, Function]>} handleApiPairs - Array of [eventName, handler] pairs
 *   to register on the server socket.  Each handler is bound to the socket as `this`.
 */
export default async function jestSocketApiSetup(userId, handleApiPairs) {
  // Ensure window exists (needed when running in the default node jest environment).
  if (typeof window === 'undefined') global.window = {}

  // Define window.socket as a configurable getter so jest.spyOn can replace it
  // per parallel test without touching other tests.
  if (!Object.getOwnPropertyDescriptor(global.window, 'socket')) {
    Object.defineProperty(global.window, 'socket', {
      get: function () {
        return undefined
      },
      configurable: true,
      enumerable: true,
    })
  }

  // --- server ---
  const httpServer = createServer()
  // Explicitly supply the ws WebSocketServer so engine.io doesn't accidentally
  // pick up jsdom's browser-side WebSocket global as the wsEngine.
  const io = new Server(httpServer, { wsEngine: WebSocketServer })
  let connections = 0

  io.on('connection', socket => {
    connections++
    socket.synuser = { id: userId }
    for (const [handle, socketApi] of handleApiPairs) {
      socket.on(handle, socketApi.bind(socket))
    }
    socket.on('disconnect', () => {
      if (--connections <= 0) {
        io.close()
      }
    })
  })

  // Retry on port-in-use so parallel test suites don't collide.
  const serverPort = new Promise((ok, ko) => {
    httpServer.on('error', e => {
      if (e.code === 'EADDRINUSE') {
        httpServer.close()
        httpServer.listen(SocketIoPort++)
      } else {
        ko(e)
      }
    })
    httpServer.listen(SocketIoPort++, () => {
      ok(httpServer.address().port)
    })
  })
  const port = await serverPort

  // --- client ---
  const socket = clientIo.connect(`http://localhost:${port}`)

  // Use jest.spyOn so each parallel test file gets its own window.socket without
  // affecting the others.
  const windowSpy = jest.spyOn(window, 'socket', 'get')
  socket.on('disconnect', () => windowSpy.mockRestore())
  windowSpy.mockImplementation(() => socket)

  // Wait until the connection is established before returning.
  await new Promise(ok => socket.on('connect', ok))
}

/**
 * Disconnect the client socket created by jestSocketApiSetup.
 * Call this in afterEach.
 */
export function jestSocketApiTeardown() {
  if (window.socket) {
    window.socket.close()
  }
}
