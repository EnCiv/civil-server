describe('Reset Password', () => {
  const activationKey = 'RWx3ZE02dElpRlhn'
  const activationToken = 'UmFVdityNDFTa2VW'
  const resetPasswordUrl = `/resetPassword?t=${activationToken}&p=/join`
  const newPassword = 'newPassword'

  const seedUser = tokenExpirationDate => {
    const insertUser = {
      firstName: 'CypressPassword',
      lastName: 'User',
      email: 'cypressPassword@example.com',
      password: '$2b$10$k.hGsOGo767S24ZglYm7PeWYTDf5bogFASx/5FqWDuaIzb3AumlK.', // old password is 'password'
      activationKey: activationKey,
      activationToken: activationToken,
      tokenExpirationDate,
    }
    cy.log(JSON.stringify(insertUser).replace(/"/g, '\\"'))
    cy.exec("npm run mongo:delete-user -- 'cypressPassword@example.com'")
    cy.exec('mongo --eval "db.users.insert(' + JSON.stringify(insertUser).replace(/"/g, '\\"') + ')"')
  }

  beforeEach(() => {
    seedUser(new Date())
  })

  it('Expired reset key shows the expired message and no form', () => {
    seedUser(new Date(Date.now() - 11 * 60 * 1000))
    cy.visit(resetPasswordUrl)
    cy.contains('This reset key has expired')
    cy.get('input[name=resetKey]').should('not.exist')
  })

  it('Password Mismatch displays error', () => {
    cy.visit(resetPasswordUrl)
    cy.contains('Reset Password')

    cy.get('input[name=resetKey]').type(activationKey)
    cy.get('input[name=newPassword]').type(newPassword)
    cy.get('input[name=confirmPassword]').type('mismatch')

    cy.contains("Passwords don't match")
  })

  it('Bad Reset Key', () => {
    cy.visit(resetPasswordUrl)
    cy.contains('Reset Password')

    cy.get('input[name=resetKey]').type('notTheRightResetKey')
    cy.get('input[name=newPassword]').type(newPassword)
    cy.get('input[name=confirmPassword]').type(newPassword + '{enter}')

    cy.contains('This reset key is not valid')
  })

  it('No New Password Entered', () => {
    cy.visit(resetPasswordUrl)
    cy.contains('Reset Password')

    cy.get('input[name=resetKey]').type(activationKey + '{enter}')

    cy.contains('Welcome Aboard').should('not.exist')
  })

  it('can be reset for user', () => {
    cy.visit(resetPasswordUrl)
    cy.contains('Reset Password')

    cy.get('input[name=resetKey]').type(activationKey)
    cy.get('input[name=newPassword]').type(newPassword)
    cy.get('input[name=confirmPassword]').type(newPassword + '{enter}')

    // can log in with new password
    // cy.visit('/join')
    cy.contains('Login').click()

    cy.get('input[name=email]').type('cypressPassword@example.com')
    cy.get('input[name=password]').type(newPassword + '{enter}')

    cy.contains('Welcome Aboard')
  })
})
