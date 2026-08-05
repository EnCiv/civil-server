module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest-test-setup.js'],
  preset: '@shelf/jest-mongodb',
  testPathIgnorePatterns: ['/node_modules/', '/cypress/'],
  watchPathIgnorePatterns: ['<rootDir>/tmp/', '<rootDir>/node_modules/'],
  // Allow jest to transform civil-client (linked junction), bson (mjs-only in
  // mongodb v7), and marked (esm-only in v18) instead of running them as CJS.
  transformIgnorePatterns: ['/node_modules/(?!(civil-client|bson|marked)/)'],
  // Override @shelf/jest-mongodb preset transform: enable JSX and .mjs files.
  // The preset default only enables TypeScript syntax with no JSX support.
  transform: {
    '^.+\.m?[jt]sx?$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'ecmascript', jsx: true } } },
    ],
  },
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
