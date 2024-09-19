// https://github.com/EnCiv/civil-server/issues/45

'use strict'

import React, { useEffect, useState, useRef } from 'react'
import { hot } from 'react-hot-loader'
import WebComponents from '../web-components'
import Footer from './footer'
import { ErrorBoundary } from 'civil-client'
import { Helmet } from 'react-helmet'
import EncivCookies from './enciv-cookies'

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

function App(props) {
  var { iota, ...newProps } = props

  if (iota) {
    Object.assign(newProps, iota)
    return (
      <ErrorBoundary>
        <div style={{ position: 'relative' }}>
          <Helmet>
            <title>{iota?.subject || 'Candiate Conversations'}</title>
          </Helmet>
          <DynamicFontSizeHelmet />
          <EncivCookies user={newProps.user} />
          <WebComponents key="web-component" webComponent={iota.webComponent} {...newProps} />
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

export default hot(module)(App)
