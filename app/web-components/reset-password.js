'use strict'

import React, { useState, useEffect } from 'react'
import { createUseStyles } from 'react-jss'
import { ResetPassword as ClientResetPassword } from 'civil-client'

function ResetPassword() {
  const classes = useStyles()
  const [params, setParams] = useState(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const urlParams = new URLSearchParams(document.location.search)
    setParams(urlParams)
    const activationToken = urlParams.get('t')
    if (activationToken && window.socket) {
      window.socket.emit('check-reset-token', activationToken, (error, expired) => {
        if (error) return console.error('check-reset-token failed:', error)
        setExpired(!!expired)
      })
    }
  }, [])

  return (
    <div className={classes.wrapper}>
      <div className={classes.centeredWrapper}>
        <ClientResetPassword activationToken={params?.get('t') || ''} returnTo={params?.get('p') || ''} expired={expired} />
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
})

export default ResetPassword
