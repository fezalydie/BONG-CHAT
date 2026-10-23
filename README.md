# BONG CHAT

An all-in-one social networking platform — a feed, reels, 24-hour stories,
real-time messaging, notifications, search and a built-in AI assistant — in a
single npm-workspaces monorepo.

## Features

- **Feed** — create posts with photos or short videos, like, share, comment and delete your own content.
- **Reels** — a full-screen, snap-scrolling feed of short vertical videos with likes, comments and unique view counts; upload your own from the Reels page.
- **Stories** — 24-hour photo, video or text stories with gradient backgrounds (they expire automatically).
- **Messaging** — real-time 1:1 conversations over Socket.IO, with photo sharing, clickable links, typing indicators and a "new message" people picker.
- **Notifications** — likes, comments, follows, follow requests and approvals, shares and messages; mark one or all as read, or clear them.
- **Search** — unified search across people, posts and hashtags, plus quick web shortcuts.
- **Profiles** — follow/unfollow, private accounts with follow requests (approve/decline), followers/following lists, block users.
- **AI assistant** — a built-in helper out of the box; plug in an OpenAI-compatible provider to upgrade it.
- **Settings** — theme (light/dark/system), language, privacy and follow requests, notification preferences, password change, blocked accounts and account deletion.
- **Quick links** — official entry points to Facebook, Instagram and WhatsApp.

## Tech stack

| Layer    | Tech                                                                        |
| -------- | --------------------------------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, lucide-react, dayjs |
| Backend  | Node.js, Express, TypeScript, Socket.IO, Zod, Multer, Knex                  |
| Database | SQLite by default (better-sqlite3); PostgreSQL supported                    |
| Auth     | JWT in an HttpOnly cookie, bcrypt password hashing                          |

## Project structure

```
bong-chat/
├── client/                 # Vite + React frontend
│   ├── src/
│   │   ├── components/     # layout, posts, stories, messages, common (Modal, Toast)
│   │   ├── context/        # Auth, Theme, Socket providers
│   │   ├── lib/            # api helper, story gradients
│   │   ├── pages/          # one component per route
│   │   └── types/          # shared TypeScript types
│   └── vite.config.ts      # dev proxy + "@/" path alias
├── server/                 # Express API + Socket.IO
│   ├── src/
│   │   ├── routes/         # auth, users, posts, stories, messages, ...
│   │   ├── middleware/     # auth, rate limiting
│   │   ├── services/       # notifications, realtime
│   │   ├── scripts/        # migrate, seed
│   │   ├── migrations/     # Knex migrations
│   │   ├── config.ts       # environment configuration
│   │   └── db.ts           # Knex instance + migration runner
│   ├── test/               # end-to-end API tests (node:test)
│   └── data/               # SQLite database file (created on first run)
├── deploy/                 # systemd unit + nginx reverse-proxy config
├── Dockerfile              # multi-stage production image
├── docker-compose.yml      # app + PostgreSQL stack
└── package.json            # workspace root + shared scripts
```

## Prerequisites

- Node.js 18+ (developed against Node 20/24)
- npm 9+

## Getting started

```bash
# 1. Install all workspace dependencies
npm install

# 2. (optional) Configure the server — all settings have sensible defaults
cp server/.env.example server/.env

# 3. Create the database and load demo data
npm run migrate
npm run seed

# 4. Start the API and the web app together
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:4000/api/health

Vite proxies `/api` and `/uploads` to the API during development, so the browser
only ever talks to port 5173.

## Demo accounts

The seed script creates four users. **Every account uses the password
`password123`.**

| Username | Email                 |
| -------- | --------------------- |
| alice    | alice@bongchat.dev    |
| bishal   | bishal@bongchat.dev   |
| chitra   | chitra@bongchat.dev   |
| dipu     | dipu@bongchat.dev     |

## Scripts

Run from the repository root:

| Script          | Description                                        |
| --------------- | -------------------------------------------------- |
| `npm run dev`   | Start API and web app in watch mode                |
| `npm run build` | Type-check and build both workspaces               |
| `npm start`     | Run the compiled server (`server/dist/index.js`)   |
| `npm run migrate` | Apply database migrations                        |
| `npm run seed`  | Insert demo data (no-op if already seeded)         |
| `npm run migrate:prod` / `seed:prod` | Same, against the compiled server (used in Docker) |
| `npm run docker:up` / `docker:build` / `docker:down` | Docker Compose helpers      |
| `npm test`      | Run the server API test suite                      |

Workspace-specific scripts are also available with `-w server` / `-w client`,
for example `npm run build -w client`.

### Tests

`npm test` runs the server end-to-end API suite (`server/test/api.test.ts`) using
Node's built-in test runner via `tsx` — no extra test framework is required. The
suite boots the real Express app against a throwaway SQLite database and uploads
folder in the system temp directory, so your development data is never touched.
It covers auth (register, login, change/reset password), posts and comments,
likes/shares/views, reels (publish, like, view, comment, privacy), follows,
follow requests, blocking, private accounts, profile and settings updates,
stories (text, photo and video), messaging (send, read receipts, conversation
list, typing indicators), image and video uploads, notifications (per-item and
bulk read), search, the assistant and account deletion.


## Deployment

In production one Node process serves everything — the API, Socket.IO, uploaded
files and the built React client — on a single port. Build once, then run the
compiled server:

```bash
npm ci
npm run build          # compiles server/ -> server/dist and client/ -> client/dist
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) npm start
```

`NODE_ENV=production` makes the server serve `client/dist` (including SPA deep
links), serve uploads with a 7-day cache header, and is what you want on any
host. Migrations run automatically on boot; `npm run seed:prod` adds the demo
accounts if you want them.

Two ready-to-use paths are included:

### Docker Compose (app + PostgreSQL)

```bash
cp .env.example .env            # set WEB_ORIGIN and a real JWT_SECRET
docker compose up --build       # app on http://localhost:4000
```

- `Dockerfile` — multi-stage build: install → build both workspaces → pruned
  runtime image (`node:20-bookworm-slim`), with a `HEALTHCHECK` on `/api/health`.
- `docker-compose.yml` — runs the app against PostgreSQL 16 and keeps uploads on
  a named volume. Drop the `db` service and the `DB_CLIENT`/`DATABASE_URL`
  variables to fall back to SQLite on a volume instead.

| Command | What it does |
| ------- | ------------ |
| `npm run docker:up`   | `docker compose up --build` |
| `npm run docker:build` | Build the app image (`bong-chat`) |
| `npm run docker:down` | Stop and remove the stack |

### Bare VM / bare metal (systemd + nginx)

- `deploy/bong-chat.service` — systemd unit that runs `node server/dist/index.js`
  as an unprivileged user, with only `server/data` and `server/uploads` writable.
- `deploy/nginx.conf` — nginx TLS reverse proxy. It forwards `/socket.io/` with
  the WebSocket upgrade headers (required for real-time messaging) and raises
  `client_max_body_size` for video uploads.

### Production checklist

- **`JWT_SECRET`** — set a long random value; anyone with it can forge sessions.
- **`WEB_ORIGIN`** — set it to your public `https://` URL so CORS and links match.
- **Database** — SQLite is fine for a single instance; use PostgreSQL
  (`DB_CLIENT=pg` + `DATABASE_URL`) when running multiple instances or wanting
  managed backups.
- **Uploads** — mount `server/uploads` on persistent storage, or point
  `UPLOAD_DIR` at a shared disk; uploads are not replicated between instances.
- **Upload limits** — `MAX_UPLOAD_MB` (images) and `MAX_VIDEO_MB` (video) should
  be no larger than your reverse proxy's `client_max_body_size`.
- **Reverse proxy** — terminate TLS in front of the app and forward the
  `Upgrade`/`Connection` headers for Socket.IO.

## Environment variables

The server reads these from the environment (or a `server/.env` file via
`dotenv`). Copy `server/.env.example` to `server/.env` to get started; all
variables have sensible defaults for local development.

| Variable             | Default                  | Description                                            |
| -------------------- | ------------------------ | ------------------------------------------------------ |
| `PORT`               | `4000`                   | API/Socket.IO port                                     |
| `WEB_ORIGIN`         | `http://localhost:5173`  | Allowed CORS origin for the web client                 |
| `NODE_ENV`           | —                        | Set to `production` to serve the built client          |
| `JWT_SECRET`         | `dev-secret-change-me`   | **Change this in production**                          |
| `SESSION_TTL_HOURS`  | `168`                    | Auth cookie lifetime (7 days)                          |
| `DB_CLIENT`          | —                        | Set to `pg` to use PostgreSQL instead of SQLite        |
| `DATABASE_FILE`      | `./data/bongchat.db`     | SQLite file path (relative to `server/`)               |
| `DATABASE_URL`       | —                        | PostgreSQL connection string (when `DB_CLIENT=pg`)     |
| `UPLOAD_DIR`         | `./uploads`              | Where uploaded images are stored                       |
| `MAX_UPLOAD_MB`      | `8`                      | Maximum image upload size in megabytes                 |
| `MAX_VIDEO_MB`       | `50`                     | Maximum video upload size in megabytes (stories, posts and reels) |
| `STORY_TTL_HOURS`    | `24`                     | How long a story lasts before expiring                 |
| `AI_PROVIDER`        | —                        | AI provider id; when unset, the built-in assistant is used |
| `AI_API_KEY`         | —                        | API key for the AI provider                            |
| `AI_BASE_URL`        | `https://api.openai.com/v1` | OpenAI-compatible API base URL                       |
| `AI_MODEL`           | `gpt-4o-mini`            | Model name for the AI provider                         |

## API overview

All endpoints live under `/api` and (unless noted) require an authenticated
session cookie.

| Area          | Endpoints                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------- |
| Auth          | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`; `GET /auth/me` |
| Users         | `GET /users/me`, `PUT /users/me`, `DELETE /users/me`; `GET /users/:username`, `/followers`, `/following`; `POST /users/:username/follow`, `/block`; `GET /users/suggestions`, `/blocked`; `GET /users/requests`, `POST /users/requests/:username/accept`, `/reject` |
| Posts         | `GET /posts`, `POST /posts` (accepts `imageUrl` or `videoUrl`), `GET /posts/:id`, `DELETE /posts/:id`; `POST /posts/:id/like`, `/share`, `/view`; `GET`/`POST /posts/:id/comments`, `DELETE /posts/:id/comments/:commentId` |
| Reels         | `GET /reels` (`?username=`, `?page=`), `POST /reels` (requires `videoUrl`), `GET /reels/:id`, `DELETE /reels/:id`; `POST /reels/:id/like`, `/view`; `GET`/`POST /reels/:id/comments`, `DELETE /reels/:id/comments/:commentId` |
| Stories       | `GET /stories`, `POST /stories`, `GET /stories/:id`, `POST /stories/:id/view`, `DELETE /stories/:id` |
| Messages      | `GET`/`POST /messages/conversations`; `GET`/`POST /messages/conversations/:id/messages`; `POST /messages/conversations/:id/read` |
| Notifications | `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read`, `DELETE /notifications` |
| Search        | `GET /search?q=&type=`                                                                    |
| Settings      | `GET /settings`, `PUT /settings`                                                          |
| Uploads       | `POST /uploads` (image) and `POST /uploads/video` (video) — multipart `file`; returns `{ url }` |
| AI            | `GET /ai/suggestions`, `POST /ai/message`                                                 |
| Integrations  | `GET /integrations` (public — Facebook / Instagram / WhatsApp entry points)               |

### Realtime

Socket.IO runs on the same server. Events include message delivery and live
unread/notification counts.

## Notes

- **AI provider** — with no `AI_PROVIDER`/`AI_API_KEY` set, the server answers
  from a built-in assistant so the feature works offline. Set both variables to
  route requests to any OpenAI-compatible endpoint.
- **Database** — SQLite is used by default for zero-config local runs.
  Migrations are applied automatically on server start and via `npm run migrate`.
- **Uploads** — images and story videos are written to `server/uploads` and served at `/uploads/*`.
