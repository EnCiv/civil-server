# civil-server

**civil-server** is an open-source Node.js server framework built for civic-engagement applications. It provides the common infrastructure that powers projects in the [EnCiv](https://enciv.org) ecosystem.

## What It Does

- **Express HTTP server** — pre-configured with security middleware (helmet, rate limiting, cookie handling) and server-side React rendering.
- **MongoDB integration** — connects via `@enciv/mongo-collections`, exposing the `Iota` and `User` models as a shared data layer.
- **Socket.IO API layer** — real-time socket APIs alongside standard REST routes, enabling live collaboration features.
- **Authentication flows** — built-in sign-up, sign-in, sign-out, and password-reset routes backed by bcrypt and token-based email verification.
- **Webpack dev server** — hot-module replacement in development; production builds emit to `dist/`.
- **Composable routes and socket APIs** — consuming projects drop files into `app/routes/` and `app/socket-apis/` and they are auto-loaded by the server.

## Key Exports

| Symbol                | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `theCivilServer`      | The main server class — instantiate to start the HTTP + Socket.IO server |
| `serverEvents`        | EventEmitter for server lifecycle hooks                                  |
| `Iota`                | MongoDB model for generic content objects                                |
| `User`                | MongoDB model for authenticated users                                    |
| `serverReactRender`   | Server-side React rendering middleware                                   |
| `SibSendTransacEmail` | Send transactional email via Brevo (SendinBlue)                          |

## Technology Stack

- **Node.js** 20 LTS
- **Express** 4 / Socket.IO
- **React** 16 (upgrade to 19 in progress)
- **MongoDB** 5 via `@enciv/mongo-collections`
- **Webpack** 5 with Babel transpilation
- **joi** 17 for data validation

## Getting Started

```bash
git clone https://github.com/EnCiv/civil-server
cd civil-server
npm install
cp .env.example .env   # add your MONGODB_URI and other secrets
npm run dev
```

Browse to `http://localhost:3011` once the server starts.
