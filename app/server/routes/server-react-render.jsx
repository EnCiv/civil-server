'use strict'

import React from 'react' // needed by render to string
import { renderToString } from 'react-dom/server'
import { JssProvider, SheetsRegistry, createGenerateId } from 'react-jss'
import cloneDeep from 'lodash/cloneDeep'
import { Helmet } from 'react-helmet'

const googleAnalytics = (props, req, res) =>
  process.env.GOOGLE_ANALYTICS
    ? `<!-- Global site tag (gtag.js) - Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${process.env.GOOGLE_ANALYTICS}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${process.env.GOOGLE_ANALYTICS}');
</script>`
    : ''

// extract meta tags from the web component
const metaTags = (props, req, res) =>
  (props.iota &&
    props.iota.webComponent &&
    props.iota.webComponent.metaTags &&
    props.iota.webComponent.metaTags.reduce((acc, meta) => acc + `<meta ${meta}>\n`, '')) ||
  ''

function serverReactRender(App, req, res, next) {
  try {
    const dev = process.env.NODE_ENV || 'development'

    const user = req.cookies?.synuser
      ? typeof req.cookies?.synuser === 'string'
        ? JSON.parse(req.cookies.synuser)
        : req.cookies.synuser
      : undefined

    const props = Object.assign(
      {
        env: dev, // depricated should go away one day
        path: req.path,
        user,
        notFound: req.notFound,
        error: res.locals.error,
        location: req.url, // may be used by for use by react-router
      },
      cloneDeep(req.reactProps)
    )

    const sheets = new SheetsRegistry()
    const generateId = createGenerateId()

    const body = renderToString(
      <JssProvider registry={sheets} generateId={generateId}>
        <App {...props} />
      </JssProvider>
    )
    const helmet = Helmet.renderStatic()

    // figure out if browsers supports ES6 or not.
    const ifES6 = () =>
      props.browserConfig &&
      ((props.browserConfig.browser.name == 'chrome' && props.browserConfig.browser.version[0] >= 54) ||
        (props.browserConfig.browser.name == 'safari' && props.browserConfig.browser.version[0] >= 11) ||
        (props.browserConfig.browser.name == 'opera' && props.browserConfig.browser.version[0] >= 41) ||
        (props.browserConfig.browser.name == 'firefox' && props.browserConfig.browser.version[0] >= 50) ||
        (props.browserConfig.browser.name == 'edge' && props.browserConfig.browser.version[0] >= 15))
        ? (logger.info('index browser supports ES6'), '')
        : (logger.info('index browser does not support ES6'), '')

    // add google analitics code if env is set - usually only set in production

    const ifLoadSockets = () =>
      !(
        req.hostname.startsWith('cc2020') || // host is the CDN
        req.hostname.startsWith('undebate-stage1') || // host is stage-1 for testing
        (dev === 'production' &&
          props.iota &&
          props.iota.webComponent &&
          props.iota.webComponent.participants &&
          !props.iota.webComponent.participants.human)
      )

    return res.send(
      `<!doctype html>
            <html ${helmet.htmlAttributes.toString()}>
                <head>
                    ${
                      helmet.title.toString() === '<title data-react-helmet="true"></title>'
                        ? `<title>${(props.iota && props.iota.subject) || 'Candidate Conversations'}</title>`
                        : helmet.title.toString()
                    }
                    <meta httpEquiv='X-UA-Compatible' content='IE=edge'/>
                    <meta name='viewport' content='width=device-width, maximum-scale=1.0, initial-scale=1.0' />
                    <meta charSet="UTF-8"/>
                    ${helmet.meta.toString()}
                    <link rel='icon' type='image.png' href='/assets/images/favicon-16x16.png' sizes='16x16'/>
                    <link rel='icon' type='image/png' href='/assets/images/favicon-32x32.png' sizes='32x32'/>
                    <link rel="apple-touch-icon" sizes="180x180"  href="/assets/images/apple-touch-icon.png" />
                    <link rel="manifest"  href="/assets/images/site.webmanifest"/>
                    <link rel="shortcut icon" href="/assets/images/favicon.ico" />
                    ${helmet.link.toString()}
                    <meta name="theme-color" content="#ffffff"/>
                    <link href="https://fonts.googleapis.com/css?family=Montserrat&display=swap" rel="stylesheet">
                    <link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
                    <style type="text/css">
                        ${sheets.toString()}
                    </style>
                    <script>window.reactProps=${JSON.stringify(props) + ''}</script>
                    <script>window.env="${props.env}"</script>
                    <script src="https://kit.fontawesome.com/7258b64f3b.js" crossorigin="anonymous" async></script>
                    ${serverReactRender.head.reduce(
                      (str, h) =>
                        str +
                        ((str && '\n') || '') +
                        (typeof h === 'string' ? h : typeof h === 'function' ? h(props, req, res) : ''),
                      ''
                    )}
                    <script>if(!window.process) window.process={}; if(!window.process.env) window.process.env={}; Object.assign(window.process.env, ${JSON.stringify(
                      (() => {
                        const browserEnv =
                          typeof window === 'undefined' &&
                          (process.env.BROWSER_ENV || '')
                            .split(',')
                            .reduce((env, key) => (key && (env[key] = process.env[key]), env), {})
                        if (browserEnv && !browserEnv.NODE_ENV) browserEnv.NODE_ENV = 'development'
                        return browserEnv
                      })()
                    )})</script>
                    ${helmet.script.toString()}
                </head>
                <body style="margin: 0; padding: 0" ${helmet.bodyAttributes.toString()}>
                    <div id="synapp">${body}</div>
                    ${ifES6()}
                    ${ifLoadSockets() ? '<script src="/socket.io/socket.io.js" ></script>' : ''}
                    <script src='/assets/webpack/main.js' ></script>
                    <script src="https://webrtc.github.io/adapter/adapter-latest.js"></script>
                </body>
            </html>`
    )
  } catch (error) {
    logger.info('server-react-render failed', req.path)
    next(error)
  }
}

serverReactRender.head = []
serverReactRender.head.push(googleAnalytics)
serverReactRender.head.push(metaTags)

export default serverReactRender
