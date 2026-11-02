/**
 * @jest-environment jsdom
 */
'use strict'

import React from 'react'
import { render, screen, act } from '@testing-library/react'
import ResetPassword from '../../web-components/reset-password'

// the civil-client form is not under test here; stub it so we can see when it renders and what it is given
jest.mock(
  'civil-client',
  () => ({
    ResetPassword: ({ activationToken, returnTo }) => (
      <div data-testid="form" data-token={activationToken} data-return-to={returnTo} />
    ),
  }),
  { virtual: true }
)

const EXPIRED_MESSAGE = 'This reset key has expired. Please request a new password reset email.'

function setUrl(search) {
  window.history.pushState({}, '', '/resetPassword' + search)
}

// renders the component and returns the callback it passed to socket.emit('check-reset-token', ...)
function renderAndGetPrecheckCallback() {
  const utils = render(<ResetPassword />)
  expect(window.socket.emit).toHaveBeenCalledTimes(1)
  const [event, token, callback] = window.socket.emit.mock.calls[0]
  expect(event).toBe('check-reset-token')
  expect(token).toBe('tok123')
  return { ...utils, callback }
}

describe('reset-password web component', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    window.socket = { emit: jest.fn() }
    setUrl('?t=tok123&p=/join')
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    delete window.socket
  })

  test('shows a placeholder, not the form, while the precheck is pending', () => {
    renderAndGetPrecheckCallback()
    expect(screen.getByText('Checking your link...')).toBeInTheDocument()
    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
  })

  test('shows the form once a non-expired result arrives', () => {
    const { callback } = renderAndGetPrecheckCallback()
    act(() => callback({ success: true, expired: false }))
    const form = screen.getByTestId('form')
    expect(form).toHaveAttribute('data-token', 'tok123')
    expect(form).toHaveAttribute('data-return-to', '/join')
    expect(screen.queryByText('Checking your link...')).not.toBeInTheDocument()
  })

  test('shows the expired message and no form when the token is expired', () => {
    const { callback } = renderAndGetPrecheckCallback()
    act(() => callback({ success: true, expired: true, code: 'RESET_KEY_EXPIRED', message: EXPIRED_MESSAGE }))
    expect(screen.getByText(EXPIRED_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
  })

  test('shows the form when the precheck reports failure', () => {
    const { callback } = renderAndGetPrecheckCallback()
    act(() => callback({ success: false, code: 'GENERIC_RESET_ERROR', message: 'boom' }))
    expect(screen.getByTestId('form')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalledWith('check-reset-token failed:', 'boom')
  })

  test.each([undefined, null])('shows the form, without throwing, when the callback gets %s', response => {
    const { callback } = renderAndGetPrecheckCallback()
    act(() => callback(response))
    expect(screen.getByTestId('form')).toBeInTheDocument()
  })

  test('falls back to the form if the precheck never calls back', () => {
    renderAndGetPrecheckCallback()
    act(() => jest.advanceTimersByTime(4999))
    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
    act(() => jest.advanceTimersByTime(1))
    expect(screen.getByTestId('form')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalledWith('check-reset-token timed out')
  })

  test('ignores a result that arrives after the timeout', () => {
    const { callback } = renderAndGetPrecheckCallback()
    act(() => jest.advanceTimersByTime(5000))
    act(() => callback({ success: true, expired: true, message: EXPIRED_MESSAGE }))
    expect(screen.getByTestId('form')).toBeInTheDocument()
    expect(screen.queryByText(EXPIRED_MESSAGE)).not.toBeInTheDocument()
  })

  test('clears the timeout and ignores the callback if unmounted first', () => {
    const { callback, unmount } = renderAndGetPrecheckCallback()
    unmount()
    expect(jest.getTimerCount()).toBe(0)
    expect(() => callback({ success: true, expired: false })).not.toThrow()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('shows the form without emitting when there is no token in the URL', () => {
    setUrl('')
    render(<ResetPassword />)
    expect(window.socket.emit).not.toHaveBeenCalled()
    expect(screen.getByTestId('form')).toBeInTheDocument()
  })

  test('shows the form when there is no socket', () => {
    delete window.socket
    render(<ResetPassword />)
    expect(screen.getByTestId('form')).toBeInTheDocument()
  })
})
