module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest-test-setup.js'],
  preset: '@shelf/jest-mongodb',
  testPathIgnorePatterns: ['/node_modules/', '/cypress/'],
  watchPathIgnorePatterns: ['<rootDir>/tmp/', '<rootDir>/node_modules/'],
  // Allow jest to transform civil-client source files (the package is linked
  // via a Windows junction into node_modules, so it needs an explicit exception
  // to the default "ignore everything in node_modules" rule).
  transformIgnorePatterns: ['/node_modules/(?!civil-client/)'],
  // Force Node.js-side ws package even in jsdom test environments.
  // The ws package has a browser field that returns a throw-only stub;
  // Jest picks that up when running with @jest-environment jsdom, which
  // breaks socket.io's engine.io WebSocket server setup.
  moduleNameMapper: {
    '^ws$': '<rootDir>/node_modules/ws/index.js',
  },
  roots: ['app'],
  testMatch: ['**/app/**/*tests*/**/*.js'],
}
