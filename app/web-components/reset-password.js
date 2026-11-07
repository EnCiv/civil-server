'use strict'

import React, { useState, useEffect } from 'react'
import { createUseStyles } from 'react-jss'
import { ResetPassword as ClientResetPassword } from 'civil-client'

const PRECHECK_TIMEOUT_MS = 5000 // a guess; tune if the precheck is normally slower than this
// same wording as the login page's Forgot Password flow (civil-client auth-form/login-form.jsx)
const NO_EMAIL_ENTERED_ERROR = 'Please enter an email before clicking Send'
const SENT_MESSAGE = 'Message sent! Please check your inbox'

function ExpiredResend({ message, returnTo }) {
  const classes = useStyles()
  const [email, setEmail] = useState('')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  const send = e => {
    e.preventDefault()
    if (!email) {
      setInfo('')
      return setError(NO_EMAIL_ENTERED_ERROR)
    }
    setError('')
    setInfo('One moment...')
    window.socket.emit('send-password', email, returnTo, response => {
      // send-password calls back with { error } on failure, and sometimes a bare string
      const failure = typeof response === 'string' ? response : response?.error
      if (failure) {
        setInfo('')
        setError(failure === 'User not found' ? 'Email not found' : failure)
      } else {
        setError('')
        setInfo(SENT_MESSAGE)
      }
    })
  }

  return (
    <form className={classes.resend} onSubmit={send}>
      <div className={classes.expired}>{message}</div>
      <input
        className={classes.emailInput}
        name="email"
        type="email"
        placeholder="email@address.com"
        aria-label="Email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <button type="submit" className={classes.sendBtn}>
        Send
      </button>
      {info && <div>{info}</div>}
      {error && <div className={classes.error}>{error}</div>}
    </form>
  )
}

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
          <ExpiredResend message={check.message} returnTo={params?.get('p') || ''} />
        ) : (
          <ClientResetPassword
            activationToken={params?.get('t') || ''}
            returnTo={params?.get('p') || ''}
            onExpired={message => setCheck({ expired: true, message })}
          />
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
  resend: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  },
  emailInput: {
    width: '25rem',
    maxWidth: '100%',
    padding: '0.75rem',
    fontSize: '1.25rem',
  },
  sendBtn: {
    width: '9rem',
    height: '3rem',
    fontSize: '1.5rem',
    fontWeight: '600',
    backgroundColor: '#E5A650',
    color: 'white',
    cursor: 'pointer',
  },
  error: {
    color: 'red',
  },
})

export default ResetPassword
