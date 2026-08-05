// https://github.com/EnCiv/undebate-ssp/wiki/Send-In-Blue-Transactional
// @getbrevo/brevo v2→v6 migration: ../../doc/brevo-v2-to-v6.md
const { BrevoClient } = require('@getbrevo/brevo')
const path = require('path')
const fs = require('fs') // require so it runs as is without having to bable it
const packageJSON = require('../../package.json')

var SibSMTPApi
export default SibSMTPApi

// parse through HTML text to get the {{params}}
const uniqueParams = content =>
  (content.match(/{{\s*([\w.]+)\s*}}/g) || []) // get the {{ params }} [] in case there's none
    .map(str => str.replace('{{', '').replace('}}', ''))
    .map(s => s.trim())
    .sort((a, b) => a.localeCompare(b))
    .filter((str, pos, ary) => !pos || str != ary[pos - 1]) // filter out duplicates

async function SibCreateTemplate(name, templateName, htmlContent) {
  const subject = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/)[1] || templateName
  try {
    const data = await SibSMTPApi.createSmtpTemplate({
      templateName: name,
      subject,
      isActive: true,
      htmlContent,
      sender: { name: '[DEFAULT_FROM_NAME]', email: brevoDefaultFromEmail },
      replyTo: '[DEFAULT_REPLY_TO]',
    })
    return data?.id
  } catch (error) {
    logger.error(
      'SendInBlueCreateTemplate caught error',
      error?.response?.res?.text,
      error?.message ? error.message : error
    )
  }
}

async function SibGetTemplate(name, htmlContent) {
  const { templates, count } = await SibSMTPApi.getSmtpTemplates()
  // if new account with no templates yet, templates might be undefined
  // templates are send down with the largest template first in the list
  // older templates with the same name may appear though this seems inconsistent but the last one created will appear first becuase in the list
  const template = templates?.find(t => t.name === name)
  if (!template) {
    return undefined
  } else {
    if (template.htmlContent !== htmlContent) {
      let i = 0
      let j = 0
      let error = false
      for (; i < template.htmlContent.length && j < htmlContent.length; i++, j++) {
        if (template.htmlContent[i] !== htmlContent[j]) {
          // SendInBlue seems to insert some spaces, so we need to skip them
          if (template.htmlContent[i] === ' ') i++
          // SendInBlue seems to remove carriage returns so ignore them
          else if (template.htmlContent[i] === '\r') i++
          else {
            logger.error(template.htmlContent.charCodeAt(i), '!==', htmlContent.charCodeAt(j), 'at', i)
            logger.error('on sendinblue:', template.htmlContent.slice(Math.max(i - 10, 0), i + 10))
            logger.error('local:', htmlContent.slice(Math.max(j - 10, 0), j + 10))
            return undefined
          }
        }
      }
      if (error) logger.error('SendInBlue template does not match repo, but using template id:', template?.id)
      const localParams = uniqueParams(htmlContent)
      const remoteParams = uniqueParams(template.htmlContent)
      for (const param of remoteParams) {
        if (!localParams.includes(p => p === param)) continue
        logger.error('remote:', param, 'local: not present')
      }
    }
    return template
  }
}

export async function SibGetTemplateId(htmlFile) {
  try {
    const htmlContent = fs.readFileSync(htmlFile, 'utf8')
    if (!htmlContent) return undefined
    const templateName = path.basename(htmlFile, '.html')

    // Extract repo name from path - find the directory just before "assets"
    const pathParts = path.normalize(htmlFile).split(path.sep)
    const assetsIndex = pathParts.findIndex(part => part === 'assets')
    const repoName = assetsIndex > 0 ? pathParts[assetsIndex - 1] : 'unknown-repo'

    const name = repoName + '/' + templateName
    const template = await SibGetTemplate(name, htmlContent)
    if (template) return template.id
    const newId = await SibCreateTemplate(name, templateName, htmlContent)
    return newId
  } catch (error) {
    logger.error('SibGetTemplateId caught error', error?.message ? error.message : error)
    return undefined
  }
}

export function SibSendTransacEmail(props) {
  return new Promise((ok, ko) => {
    SibSMTPApi.sendTransacEmail({ ...props }).then(
      body => {
        ok(body)
      },
      error => {
        logger.error('sendTransacEmail got error', error?.message ? error.message : error, 'props:', props)
        ok()
      }
    )
  })
}

export function SibDeleteSmtpTemplate(id) {
  return new Promise((ok, ko) => {
    SibSMTPApi.updateSmtpTemplate({ templateId: id, isActive: false }).then(() => {
      SibSMTPApi.deleteSmtpTemplate({ templateId: id }).then(ok, ko)
    }, ko)
  })
}

// Support both legacy SENDINBLUE_* and new BREVO_* env var names.
// BREVO_* takes precedence if both are set.
export const brevoApiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY
export const brevoDefaultFromEmail = process.env.BREVO_DEFAULT_FROM_EMAIL || process.env.SENDINBLUE_DEFAULT_FROM_EMAIL

if (brevoApiKey && brevoDefaultFromEmail) {
  SibSMTPApi = new BrevoClient({ apiKey: brevoApiKey }).transactionalEmails
} else {
  if (!brevoApiKey) logger.error('env ', 'BREVO_API_KEY (or SENDINBLUE_API_KEY)', 'not set. email sending disabled.')
  if (!brevoDefaultFromEmail)
    logger.error(
      'env ',
      'BREVO_DEFAULT_FROM_EMAIL (or SENDINBLUE_DEFAULT_FROM_EMAIL)',
      'not set. email sending disabled.'
    )
}
