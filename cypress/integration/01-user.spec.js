describe('User', () => {
  before(() => {
    cy.exec("npm run mongo:delete-user -- 'cypress@example.com'")
  })

  it('can join the app', () => {
    cy.visit('/join')
    cy.contains('Join')

    cy.get('input[name=firstName]').type('Cypress')
    cy.get('input[name=lastName]').type('User')
    cy.get('input[name=email]').type('cypress@example.com')
    cy.get('input[name=password]').type('password')
    cy.get('svg').click()
    cy.get('input[name=confirmPassword]').type('password{enter}')

    cy.contains('Welcome Aboard')
  })

  it('can login after joining', () => {
    cy.visit('/join')
    cy.contains('Login').click()

    cy.get('input[name=email]').type('cypress@example.com')
    cy.get('input[name=password]').type('password{enter}')

    cy.contains('Welcome Aboard')
  })

  it('can send the reset password email', () => {
    cy.visit('/join')
    cy.contains('Login').click()

    cy.get('input[name=email]').type('cypress@example.com')
    cy.contains('Click here').click()

    cy.contains('Message sent! Please check your inbox')
  })
})
