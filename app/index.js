'use strict'

import theCivilServer from './server/the-civil-server.js'
import serverEvents from './server/server-events'
import Iota from './models/iota'
import User from './models/user'
import serverReactRender from './server/routes/server-react-render'
import {
  SibSendTransacEmail,
  SibGetTemplateId,
  SibDeleteSmtpTemplate,
  brevoApiKey,
  brevoDefaultFromEmail,
} from './lib/send-in-blue-transactional'
import { BrevoSendTransacEmail, BrevoGetTemplateId, BrevoDeleteSmtpTemplate } from './lib/brevo-transactional'

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
  // Preferred names — Sib* aliases above are deprecated
  BrevoSendTransacEmail,
  BrevoGetTemplateId,
  BrevoDeleteSmtpTemplate,
  // Resolved env vars (work with both BREVO_* and SENDINBLUE_* names)
  brevoApiKey,
  brevoDefaultFromEmail,
}
