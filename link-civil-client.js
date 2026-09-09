#!/usr/bin/env node
'use strict'
// Creates Windows junction points so civil-client can be tested inside civil-server
// without a real npm publish. Run via: npm run link-civil-client
//
// Junctions created:
//   civil-server-update/node_modules/civil-client  -> civil-client/
//   civil-client/node_modules/react                -> civil-server-update/node_modules/react
//   civil-client/node_modules/react-dom            -> civil-server-update/node_modules/react-dom
//   civil-client/node_modules/react-jss            -> civil-server-update/node_modules/react-jss

const { execSync } = require('child_process')
const path = require('path')

const serverDir = __dirname
const clientDir = path.resolve(serverDir, '..', 'civil-client')
const serverNm = path.join(serverDir, 'node_modules')
const clientNm = path.join(clientDir, 'node_modules')

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' })
  } catch (e) {
    // ignore — rmdir fails when directory doesn't exist, that's fine
  }
}

// Remove existing junctions before recreating them
;[
  path.join(serverNm, 'civil-client'),
  path.join(clientNm, 'react'),
  path.join(clientNm, 'react-dom'),
  path.join(clientNm, 'react-jss'),
].forEach(j => run(`rmdir /s /q "${j}"`))

// Create junction: civil-server/node_modules/civil-client -> civil-client repo
run(`mklink /j "${path.join(serverNm, 'civil-client')}" "${clientDir}"`)

// Create junctions so civil-client shares civil-server's React/JSS instances
;['react', 'react-dom', 'react-jss'].forEach(pkg =>
  run(`mklink /j "${path.join(clientNm, pkg)}" "${path.join(serverNm, pkg)}"`)
)

console.log('civil-client linked')
