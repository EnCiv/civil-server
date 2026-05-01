// Brevo-prefixed re-exports of the transactional email API.
// These are the preferred names going forward; the Sib* names are deprecated
// and will be removed in a future release.
export {
  SibSendTransacEmail as BrevoSendTransacEmail,
  SibGetTemplateId as BrevoGetTemplateId,
  SibDeleteSmtpTemplate as BrevoDeleteSmtpTemplate,
} from './send-in-blue-transactional'
