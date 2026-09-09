'use strict'

import { clientMain } from 'civil-client'
import App from '../components/app'
import { JssProvider } from 'react-jss'
import React from 'react'

// Must mirror createStableGenerateId in server-react-render.jsx so client and
// server produce identical class names for the same component tree.
let _jssCounter = 0
const generateId = (rule, sheet) => {
  const prefix = (sheet && sheet.options && sheet.options.classNamePrefix) || ''
  return `${prefix}${rule.key}-${_jssCounter++}`
}

function AppWithJss(props) {
  return (
    <JssProvider generateId={generateId}>
      <App {...props} />
    </JssProvider>
  )
}

clientMain(AppWithJss)
