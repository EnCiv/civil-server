'use strict'

import React, { useState, useEffect } from 'react'
import { createUseStyles } from 'react-jss'
import { ResetPassword as ClientResetPassword } from 'civil-client'

function ResetPassword() {
  const classes = useStyles()
  const [params, setParams] = useState(null)

  useEffect(() => {
    setParams(new URLSearchParams(document.location.search))
  }, [])

  return (
    <div className={classes.wrapper}>
      <div className={classes.centeredWrapper}>
        <ClientResetPassword activationToken={params?.get('t') || ''} returnTo={params?.get('p') || ''} />
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
