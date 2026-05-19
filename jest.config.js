module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest-test-setup.js'],
  preset: '@shelf/jest-mongodb',
  testPathIgnorePatterns: ['/node_modules/', '/cypress/'],
  watchPathIgnorePatterns: ['<rootDir>/tmp/', '<rootDir>/node_modules/'],
  roots: ['app'],
  testMatch: ['**/app/**/*tests*/**/*.js'],
}
