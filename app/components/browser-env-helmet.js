import React from 'react'
import Helmet from 'helmet'

export const BrowserEnvHelmet =
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
