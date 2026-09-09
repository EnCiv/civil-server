import '@testing-library/jest-dom'

// jsdom (used when @jest-environment jsdom is set) does not always expose
// TextEncoder/TextDecoder as Node.js globals.  MongoDB's dependency
// `mongodb-connection-string-url` requires TextEncoder at module load time.
// Polyfill both so the jsdom-environment tests that also use MongoDB work.
import { TextEncoder, TextDecoder } from 'util'
if (!global.TextEncoder) global.TextEncoder = TextEncoder
if (!global.TextDecoder) global.TextDecoder = TextDecoder
