/** @jest-environment jsdom */
import React from 'react'
import { act, render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import * as CookieConsent from 'vanilla-cookieconsent'
import EncivCookies from '../enciv-cookies'
import SynuserCookie from '../../lib/synuser-cookie'
import CookiePreferencesCookie, { COOKIE_PREFERENCES_EXPIRY_DAYS } from '../../lib/cookie-preferences-cookie'

jest.mock('vanilla-cookieconsent', () => ({ run: jest.fn() }))

let config
const id = JSON.stringify(['analytics', 'Google Analytics'])
let handlers
beforeEach(() => {
  window.socket = { emit: jest.fn() }
  handlers = { onAccepted: jest.fn(), onRevoked: jest.fn() }
  window.encivCookieHandlers = { [id]: handlers }
  render(
    <HelmetProvider>
      <EncivCookies cookieCategories={[{ id, name: 'Google Analytics', category: 'analytics' }, SynuserCookie, CookiePreferencesCookie]} />
    </HelmetProvider>
  )
  config = CookieConsent.run.mock.calls.at(-1)[0]
})

afterEach(() => {
  jest.restoreAllMocks()
  delete window.socket
  delete window.encivCookieHandlers
})

test('accept all starts analytics immediately and saves granted consent', () => {
  const cookie = { categories: ['necessary', 'analytics'], services: { analytics: ['Google Analytics'] } }
  act(() => config.onFirstConsent({ cookie }))
  expect(handlers.onAccepted).toHaveBeenCalledTimes(1)
  expect(handlers.onRevoked).not.toHaveBeenCalled()
  expect(window.socket.emit).toHaveBeenCalledWith('save-consent', expect.arrayContaining([
    expect.objectContaining({ category: 'analytics', isGranted: true, services: ['Google Analytics'] }),
  ]), expect.any(Function))
})

test('changing an individual service runs the revoked callback', () => {
  act(() => config.onChange({ cookie: { categories: ['necessary', 'analytics'], services: { analytics: [] } }, changedCategories: [], changedServices: { analytics: ['Google Analytics'] } }))
  expect(handlers.onRevoked).toHaveBeenCalledTimes(1)
  expect(handlers.onAccepted).not.toHaveBeenCalled()
})

test('loading existing consent does not save consent again', () => {
  act(() => config.onConsent({ cookie: { categories: ['necessary', 'analytics'], services: { analytics: ['Google Analytics'] } } }))
  expect(window.socket.emit).not.toHaveBeenCalled()
  expect(handlers.onAccepted).not.toHaveBeenCalled()
  expect(handlers.onRevoked).not.toHaveBeenCalled()
})

test('displays synuser details in the required, non-disableable category', () => {
  expect(config.categories.necessary).toMatchObject({ enabled: true, readOnly: true })
  const section = config.language.translations.en.preferencesModal.sections.find(section => section.linkedCategory === 'necessary')
  expect(section.cookieTable).toBeUndefined()
  for (const cookie of [SynuserCookie, CookiePreferencesCookie]) {
    const label = document.createElement('div')
    label.innerHTML = config.categories.necessary.services[cookie.name].label
    expect(label.textContent).toContain(cookie.name)
    expect(label.querySelector('.enciv-cookie-description').textContent).toBe(cookie.description)
  }
  expect(config.cookie.expiresAfterDays).toBe(COOKIE_PREFERENCES_EXPIRY_DAYS)
})
