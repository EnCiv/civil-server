'use strict'

import React, { useState, useEffect } from 'react'
import { createUseStyles } from 'react-jss'
import { ResetPassword as ClientResetPassword } from 'civil-client'

const PRECHECK_TIMEOUT_MS = 5000 // a guess; tune if the precheck is normally slower than this

function ResetPassword() {
  const classes = useStyles()
  const [params, setParams] = useState(null)
  const [check, setCheck] = useState(null) // null = precheck pending

  useEffect(() => {
    const urlParams = new URLSearchParams(document.location.search)
    setParams(urlParams)
    const activationToken = urlParams.get('t')
    // no token or no socket: nothing to check, show the form (client reports MISSING_RESET_KEY)
    if (!activationToken || !window.socket) return setCheck({ expired: false })

    let settled = false
    let timer
    const settle = result => {
      if (settled) return // first outcome wins; late callbacks and unmount are ignored
      settled = true
      clearTimeout(timer)
      setCheck(result)
    }
    // precheck failed or timed out: show the form anyway, reset-password re-validates on submit
    timer = setTimeout(() => {
      console.error('check-reset-token timed out')
      settle({ expired: false })
    }, PRECHECK_TIMEOUT_MS)
    window.socket.emit('check-reset-token', activationToken, response => {
      if (!response?.success) {
        console.error('check-reset-token failed:', response?.message)
        return settle({ expired: false })
      }
      settle({ expired: !!response.expired, message: response.message })
    })
    return () => {
      settled = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className={classes.wrapper}>
      <div className={classes.centeredWrapper}>
        {!check ? (
          <div className={classes.checking}>Checking your link...</div>
        ) : check.expired ? (
          <div className={classes.expired}>{check.message}</div>
        ) : (
          <ClientResetPassword activationToken={params?.get('t') || ''} returnTo={params?.get('p') || ''} />
        )}
      </div>
    </div>
  )
}

const useStyles = createUseStyles({
  wrapper: {
    width: '100vw',
    minHeight: '100vh',
    textAlign: 'center',
    verticalAlign: 'middle',
  },
  centeredWrapper: {
    top: '50%',
    left: '50%',
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
  },
  checking: {
    fontSize: '1.5rem',
  },
  expired: {
    color: 'red',
    fontSize: '1.5rem',
    maxWidth: '30rem',
  },
})

export default ResetPassword
