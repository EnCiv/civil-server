/** @jest-environment jsdom */
import React from 'react'
import { act, render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import * as CookieConsent from 'vanilla-cookieconsent'
import EncivCookies from '../enciv-cookies'

jest.mock('vanilla-cookieconsent', () => ({ run: jest.fn() }))

let config
let appendedScripts
beforeEach(() => {
  window.socket = { emit: jest.fn() }
  appendedScripts = []
  const appendChild = document.head.appendChild.bind(document.head)
  jest.spyOn(document.head, 'appendChild').mockImplementation(element => {
    if (element.tagName === 'SCRIPT') appendedScripts.push(element.text)
    return appendChild(element)
  })
  render(
    <HelmetProvider>
      <EncivCookies cookieCategories={[{ name: 'Google Analytics', category: 'analytics', onAccepted: '/* accepted */', onRevoked: '/* revoked */' }]} />
    </HelmetProvider>
  )
  config = CookieConsent.run.mock.calls.at(-1)[0]
})

afterEach(() => {
  jest.restoreAllMocks()
  delete window.socket
})

test('accept all starts analytics immediately and saves granted consent', () => {
  const cookie = { categories: ['necessary', 'analytics'], services: { analytics: ['Google Analytics'] } }
  act(() => config.onFirstConsent({ cookie }))
  expect(appendedScripts).toEqual(['/* accepted */'])
  expect(window.socket.emit).toHaveBeenCalledWith('save-consent', expect.arrayContaining([
    expect.objectContaining({ category: 'analytics', isGranted: true, services: ['Google Analytics'] }),
  ]), expect.any(Function))
})

test('changing an individual service runs the revoked callback', () => {
  act(() => config.onChange({ cookie: { categories: ['necessary', 'analytics'], services: { analytics: [] } }, changedCategories: [], changedServices: { analytics: ['Google Analytics'] } }))
  expect(appendedScripts).toEqual(['/* revoked */'])
})

test('loading existing consent does not save consent again', () => {
  act(() => config.onConsent({ cookie: { categories: ['necessary', 'analytics'], services: { analytics: ['Google Analytics'] } } }))
  expect(window.socket.emit).not.toHaveBeenCalled()
  expect(appendedScripts).toEqual([])
})
