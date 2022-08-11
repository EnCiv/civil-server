'use strict'

import React from 'react'
import { hot } from 'react-hot-loader'
import WebComponents from '../web-components'
import Footer from './footer'
import { ErrorBoundary } from 'civil-client'
import { Helmet } from 'react-helmet'

const DynamicFontSizeHelmet =
  typeof window === 'undefined'
    ? () => (
        <Helmet
          script={[
            {
              type: 'text/javascript',
              innerHTML: `function setFontSize(){document.getElementsByTagName("html")[0].style.fontSize=Math.round(Math.min(window.innerWidth,window.innerHeight))/100*(15/(1080/100))+'px'}; window.onresize=setFontSize; setFontSize();`,
            },
          ]}
        />
      )
    : () => null

const BrowserEnvHelmet =
  typeof window === 'undefined' && typeof process !== 'undefined' && process?.env?.BROWSER_ENV
    ? () => (
        <Helmet
          script={[
            {
              type: 'text/javascript',
              innerHTML: `if(!window.process) window.process={}; if(!window.process.env) window.process.env={}; Object.assign(window.process.env, ${JSON.stringify(
                (() => {
                  const browserEnv =
                    typeof window === 'undefined' &&
                    (process.env.BROWSER_ENV || '')
                      .split(',')
                      .reduce((env, key) => (key && (env[key] = process.env[key]), env), {})
                  if (browserEnv && !browserEnv.NODE_ENV) browserEnv.NODE_ENV = 'development'
                  return browserEnv
                })()
              )})`,
            },
          ]}
        />
      )
    : () => null

class App extends React.Component {
  render() {
    if (this.props.iota) {
      var { iota, ...newProps } = this.props
      Object.assign(newProps, this.props.iota)
      return (
        <ErrorBoundary>
          <div style={{ position: 'relative' }}>
            <Helmet>
              <title>{iota?.subject || 'Candiate Conversations'}</title>
            </Helmet>
            <DynamicFontSizeHelmet />
            <BrowserEnvHelmet />
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
