/**
 * @jest-environment jsdom
 */
'use strict'

import React from 'react'
import { render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import App from '../app'

// civil-client's ErrorBoundary and WebComponents are peer deps; mock them
jest.mock(
  'civil-client',
  () => ({
    ErrorBoundary: ({ children }) => <>{children}</>,
  }),
  { virtual: true }
)

jest.mock('../../web-components', () => ({
  __esModule: true,
  default: ({ webComponent }) => <div data-testid="web-component">{webComponent}</div>,
}))

jest.mock('../footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer" />,
}))

function renderWithHelmet(ui) {
  return render(<HelmetProvider>{ui}</HelmetProvider>)
}

describe('App component', () => {
  test('renders without crashing with no props', () => {
    renderWithHelmet(<App />)
  })

  test('renders "Nothing Here" when no iota prop', () => {
    renderWithHelmet(<App />)
    expect(screen.getByText('Nothing Here')).toBeInTheDocument()
  })

  test('renders WebComponent when iota prop is provided', () => {
    const iota = { subject: 'Test Subject', webComponent: 'some-component' }
    renderWithHelmet(<App iota={iota} />)
    expect(screen.getByTestId('web-component')).toBeInTheDocument()
  })

  test('renders Footer in both branches', () => {
    const { rerender } = renderWithHelmet(<App />)
    expect(screen.getByTestId('footer')).toBeInTheDocument()

    const iota = { subject: 'Test', webComponent: 'comp' }
    rerender(
      <HelmetProvider>
        <App iota={iota} />
      </HelmetProvider>
    )
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })
})
