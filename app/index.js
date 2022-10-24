'use strict'

import theCivilServer from './server/the-civil-server.js'
import serverEvents from './server/server-events'
import Iota from './models/iota'
import User from './models/user'
import serverReactRender from './server/routes/server-react-render'
import { SibSendTransacEmail, SibGetTemplateId, SibDeleteSmtpTemplate } from './lib/send-in-blue-transactional'

// do NOT try to pass browser/client side objects through here (like AuthForm) - when you import them it will also import the server into the browser
export default theCivilServer
export {
  serverEvents,
  theCivilServer,
  Iota,
  User,
  serverReactRender,
  SibSendTransacEmail,
  SibGetTemplateId,
  SibDeleteSmtpTemplate,
}
