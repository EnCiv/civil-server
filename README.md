# **Civil Server**

This is a node server, as a component that can be included in other projects and extended for use by other projects. It is spun out from the [undebate](https://github.com/EnCiv/undebate) project so that it can be used as a common component of many projects.

The idea is that Civil Server is a component with some basic funcationality that will be useful to a lot of projects.
Some projects may take this and add more features and create a component out of that will be useful to other projects.

And when changes/improvements are made to this project, they can be easilly updated in other projects.

In addition, projects/repos that use the civil-server can be imported in other projects that use the civil-server, makeing it possible to break large server projects into smaller components, each of which can be build and tested separately.

**Copyright 2021-2024 EnCiv, Inc.** This work is licensed under the terms described in [LICENSE.txt](https://github.com/EnCiv/civil-server/blob/master/LICENSE.txt) which is an MIT license with a [Public Good License Condition](https://github.com/EnCiv/undebate#the-need-for-a-public-good-license-condition).

# Features

- **User Join/Login/Logout/Forgot Password** to get you up and running quickly with user logins
- **MongoDB** for extensible user database
- **React Server Sider Rendering** for quick page loads
- **React Progressive Web Applications** for interactive pages with low server load
- **React-Jss** for inline styles
- **Socket.io** for asyncronous, bidirectional API's
- **Server Events** for extensibility communication between api's that generate events, and multiple handlers for them
- **Helmet** for improved security
- **Webpack and nodemon** for interactive development
- **Log4js** for logging to a collection in MongoDB
- **Log4js from the browser** for debugging
- **Loader.io verification** for load testing

# changes from 0.0.27 to 1.0.0

- using Mongo-collection to replace mongo-models
- for the models Iota, and User methods like .find() no longer return documents they return a cursor and .toArray() will work
- the documents returned from methods like .findOne() or .toArray() are plain object, not of the User or Iota class. To make them of the class do `new User(doc)`
- use User.validatePassord(doc,plainTextPassword) - user.validatePassord(plainTextPassord) no longer supported
- use User.gererateKey(doc) - user.generateKey() no longer supported
- use Iota.preload() - Iota.load is not supported

# Getting Started

Follow these instructions to setup the civil-server repo:
See [Getting Started - Repo-Setup](https://github.com/EnCiv/.github/wiki/Getting-Started-%E2%80%90-Repo-Setup)

## Run it

```
npm run dev
```

You will now be able to go to http://localhost:3011

# Contributing

When you are ready to contribute please see these notes:

- [React Coding and Style Guidelines](https://github.com/EnCiv/.github/wiki/React-Coding-and-Style-Guidelines)
- [Contributing](https://github.com/EnCiv/.github/wiki/Contributing)

# How to use it

To create a new project from scratch

```bash
mkdir new-project
cd new-project
npm init #answer the questions as you want for your project
npm install github:EnCiv/civil-server
node_modules/.bin/do-civil
```

Your project directory is now ready for you.

`npm run storybook` and `npm run dev` will now work.

_app/start.js_

```js
'use strict'

const path = require('path')
import { civilServer, Iota } from 'civil-server'
import iotas from '../iotas.json'
import App from './components/app'

Iota.preload(iotas)
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
async function start() {
  try {
    const server = new civilServer()
    server.App = App
    await server.earlyStart()
    server.routesDirPaths.push(path.resolve(__dirname, './routes'))
    server.socketAPIsDirPaths.push(path.resolve(__dirname, './socket-apis'))
    server.serverEventsDirPaths.push(path.resolve(__dirname, './events'))
    await server.start()
    logger.info('started')
  } catch (error) {
    logger.error('error on start', error)
  }
}

start()
```

# App

App is your outer wrapper React App for the whole web site. A minimal version looks like this:

```js
import React from 'react'
import { hot } from 'react-hot-loader'
import WebComponents from '../web-components'
import Footer from './footer'
import ErrorBoundary from './error-boundary'

class App extends React.Component {
  render() {
    if (this.props.iota) {
      var { iota, ...newProps } = this.props
      Object.assign(newProps, this.props.iota)
      return (
        <ErrorBoundary>
          <div style={{ position: 'relative' }}>
            <WebComponents key="web-component" webComponent={this.props.iota.webComponent} {...newProps} />
            <Footer key="footer" />
          </div>
        </ErrorBoundary>
      )
    } else
      return (
        <ErrorBoundary>
          <div style={{ position: 'relative' }}>
            <div>Nothing Here</div>
            <Footer />
          </div>
        </ErrorBoundary>
      )
  }
}

export default hot(module)(App)
```

All of a sites pages will be based on WebComponents that are defined other React components as defined in app/web-components.
You will learn more about this as we go, but for each page on the site, you will create an object in Iotas.json that says the path, and the WebComponent like this

```js
[
  ...
  {
    "_id": {
      "$oid": "5d56e411e7179a084eefb365"
    },
    "path": "/join",
    "subject": "Join",
    "description": "Join the Civil Server",
    "webComponent": "Join"
  }
  ...
]
```

If a user browses to a path that matches, the webComponent named will be used to render the rest of the page, and the subject and description as passed to the webComponent as props.

# Socket API Directory

Each file in the directory represents an api call. The root of the name of the file (eg socketlogger of socketlogger.js) is the name of the socket.io event that corresponding to the api. The paramaters of the api are determined by the definition of the function.

One api that is predefined in this module is socketlogger.js

```js
'use strict'

function socketlogger(loggingEvent) {
  loggingEvent.data.push({ socketId: this.id, userId: this.synuser ? this.synuser.id : 'anonymous' })
  bslogger[loggingEvent.level.levelStr.toLowerCase()](loggingEvent.startTime, ...loggingEvent.data)
}

export default socketlogger
```

To call this API from the browser side you would use

```js
window.socket.emit('socketlogger', loggingEvent)
```

an api function can have any number of parameters, it can also have a call-back as its final parameter.

# Routes Directory

Each file in the directory represents an extension to the express server object - which can be this.app.use(...) this.app.get(...) or this.app.push(...)
An example is the sign-in route that looks like this:

```js
import expressRateLimit from 'express-rate-limit'
import sendUserId from '../util/send-user-id'

async function signIn(req, res, next) {
  try {
    const { password, ..._body } = req.body // don't let the password appear in the logs
  ...
  } catch(error){
    logger.error("signIn caught error",error)
  }
}

function route() {
  const apiLimiter = expressRateLimit({
    windowMs: 60 * 1000,
    max: 2,
    message: 'Too many attempts logging in, please try again after 24 hours.',
  })
  this.app.post('/sign/in', apiLimiter, signIn, this.setUserCookie, sendUserId)
}
export default route
```

The default function of the file will be called with this of the express object.

# Events Dirctory

**Note:** Event's aren't used much and there may be better ways now.

Within the server, components can listen for and generate events. Each file in the events directory represents an event listener, and can define the name of an Event.

To create an event listener create a file in app/events like this:

```js
import { serverEvents } from 'civil-server'

function eventListener(p1,p2,...){
 ...
}

serverEvents.on(serverEvents.eNames.EventName, eventListener)

```

In the code that is going to generate the event, do this:

```js
import { Iota, serverEvents } from 'civil-server'

serverEvents.eNameAdd('EventName')

serverEvents.emit(serverEvents.eNames.EventName, p1, p2, ...)
```

# Web Components Directory

Each file in [web-components](./app/web-components) represents a React Component. When a url matches in the iota collection path property, the web-component named in the document is looked up in the Web Components directory, and is used to render the data in the document.
After adding a new component to the directory and adding it to iotas.json, you will need to run npm install to update the auto generated index.js file in the directory.

# Contributions

Contributions are accepted under the MIT License without additional conditions. Use of the software, however, must abide by the MIT License with the Public Good Condition. This additional condition ensures that in the event the software is sold or licensed to others, the revenue so generated will be used to further the public mission of EnCiv, Inc, a 501(c)(3) nonprofit, rather than to enrich any directors, employees, members, or shareholders. (Nonprofits can not have shareholders)

# Getting started

You will need a github.com account, and a heroku.com account. Heroku is like a server in the cloud that you can push git repo's to, and after you push, heroku will build and run them. It's also great because they give you free accounts that you can use for development.

The install instructions are **[here](./doc/Install.md)**

## How to add a new web page to the server

Here is the flow. When a user visits the server with a url, `getIota()` in [get-iota.js](./app/routes/get-iota) will look up the path in the database. If it finds a match, it will look for a webComponent property and then look for a matching component in the [web-components](./app/web-components) directory and render that on the server through [app/server/routes/serverReactRender](./app/server/routes/server-react-render.jsx). All the properties of this webComponent will be passed as props to the corresponding React component.Then the page will be sent to the browser, and then rehydrated there, meaning the webComponent will run again on the browser, starting at [app/client/main-app.js](./app/client/main-app.js) and react will connect all the DOM elements.

### 1) Add a React Component to [./app/web-components](./app/components/web-components)

here is a simple one, ./app/web-components/undebate-iframes.js:

```js
'use strict'

import React from 'react'
import injectSheet from 'react-jss'

const styles = {
  title: {
    color: 'black',
    fontSize: '2rem',
    textAlign: 'center',
  },
  frame: { marginTop: '1em', marginBottom: '1em', width: '100vw' },
}

class UndebateIframes extends React.Component {
  render() {
    const { classes } = this.props
    const width = typeof window !== 'undefined' ? window.innerWidth : 1920
    const height = typeof window !== 'undefined' ? window.innerHeight : 1080

    return (
      <div>
        <div>
          <span className={classes['title']}>These are the Undebates</span>
        </div>
        <iframe
          className={classes.frame}
          height={height * 0.9}
          width={width}
          name="race1"
          src="https://cc.enciv.org/san-francisco-district-attorney"
        />
        <iframe
          className={classes.frame}
          height={height * 0.9}
          width={width}
          name="race2"
          src="https://cc.enciv.org/country:us/state:wi/office:city-of-onalaska-mayor/2020-4-7"
        />
      </div>
    )
  }
}
export default injectSheet(styles)(UndebateIframes)
```

### 2) Create a new document in [iotas.json](./iotas.json)

The example is the minimum information required. Any additional properties you add to webComponent will be passed as props to the associated React component.

```json
[ ...,
  {
      "_id": {"$oid": "60d25dc95185ab71b8fa44a0"},
      "path": "/iframe-demo",
      "subject": "Iframe demo",
      "description": "a quick prototype of a page showing multiple undebates in separate iframes",
      "webComponent": {
          "webComponent": "UndebateIframes"
      },
  }
]
```

Note: use `app/tools/mongo-id` to create a new, unique mongo id and paste it in.

### 3) Advanced: Component

If your page should pull data out of the database, or calculate something to pass to the web component, then you can add a component to [app/data-components](./app/data-components) and then add a component: {component: YourComponentNane, ...} to the document above.

## BROWSER_ENV

To pass ENV variables from the Node server to the browser, use

.bashrc:

```bash
export BROWSER_ENV=NODE_ENV,HOSTNAME
```

and

```bash
heroku config:set BROWSER_ENV=NODE_ENV,HOSTNAME -a app-name
```

or set it as a `Config Var` on heroku

Then you will be able to access them through `process.env.NODE_ENV` on the browser too.
By default, `process.env.NODE_ENV` is set to 'development'

**Do not use this to send secrets to the browser as they are not secret there**

# Testing

## Jest tests

`npm run test`

## Cypress tests

`npm run cypress:headless` or `npm run cypress`
