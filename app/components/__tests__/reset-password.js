/**
 * @jest-environment jsdom
 */
'use strict'

import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import ResetPassword from '../../web-components/reset-password'

// the civil-client form is not under test here; stub it so we can see when it renders and what it is given
jest.mock(
  'civil-client',
  () => ({
    ResetPassword: ({ activationToken, returnTo, onExpired }) => (
      <div data-testid="form" data-token={activationToken} data-return-to={returnTo}>
        <button onClick={() => onExpired('expired at submit')}>submit expired</button>
      </div>
    ),
  }),
  { virtual: true }
)

const EXPIRED_MESSAGE = 'This reset key has expired. Please enter your email and we will send a new one.'

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

  describe('expired view: send a new email', () => {
    // renders the expired view and returns the callback of the send-password emit, once a send is clicked
    function renderExpired() {
      const { callback } = renderAndGetPrecheckCallback()
      act(() => callback({ success: true, expired: true, code: 'RESET_KEY_EXPIRED', message: EXPIRED_MESSAGE }))
      window.socket.emit.mockClear()
    }
    const typeEmail = value => fireEvent.change(screen.getByLabelText('Email address'), { target: { value } })
    const clickSend = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    test('shows the message with an email input and a send button', () => {
      renderExpired()
      expect(screen.getByText(EXPIRED_MESSAGE)).toBeInTheDocument()
      expect(screen.getByLabelText('Email address')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    test('an empty email shows an error and does not emit', () => {
      renderExpired()
      clickSend()
      expect(screen.getByText('Please enter an email before clicking Send')).toBeInTheDocument()
      expect(window.socket.emit).not.toHaveBeenCalled()
    })

    test('emits send-password with the email and the return path, then confirms', () => {
      renderExpired()
      typeEmail('me@example.com')
      clickSend()
      expect(screen.getByText('One moment...')).toBeInTheDocument()
      const [event, email, returnTo, cb] = window.socket.emit.mock.calls[0]
      expect([event, email, returnTo]).toEqual(['send-password', 'me@example.com', '/join'])
      act(() => cb())
      expect(screen.getByText('Message sent! Please check your inbox')).toBeInTheDocument()
      expect(screen.queryByText('One moment...')).not.toBeInTheDocument()
    })

    test('"User not found" is shown as "Email not found"', () => {
      renderExpired()
      typeEmail('nobody@example.com')
      clickSend()
      act(() => window.socket.emit.mock.calls[0][3]({ error: 'User not found' }))
      expect(screen.getByText('Email not found')).toBeInTheDocument()
      expect(screen.queryByText('Message sent! Please check your inbox')).not.toBeInTheDocument()
    })

    test('a bare string response from send-password is shown as an error', () => {
      renderExpired()
      typeEmail('me@example.com')
      clickSend()
      act(() => window.socket.emit.mock.calls[0][3]('error sending reset password email'))
      expect(screen.getByText('error sending reset password email')).toBeInTheDocument()
      expect(screen.queryByText('Message sent! Please check your inbox')).not.toBeInTheDocument()
    })
  })

  test('switches to the expired view when the form reports an expired key on submit', () => {
    const { callback } = renderAndGetPrecheckCallback()
    act(() => callback({ success: true, expired: false }))
    fireEvent.click(screen.getByRole('button', { name: 'submit expired' }))
    expect(screen.getByText('expired at submit')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
  })
})
