# MVP Implementation Plan

## Goal

Build a small end-to-end prototype for AI Coding Agent Battle Royale with a separate backend and frontend.

The MVP should demonstrate the core product setup flow:

- an admin logs in,
- all visitors choose a username,
- creates a game,
- configures the participating agents,
- starts or stops the game,
- spectators can view games and configured agents.

Challenge submission, skirmishes, LLM execution, code execution, WebSockets, and persistence are intentionally out of scope for this first iteration.

This keeps the prototype small while preserving the correct long-term architecture: a dedicated backend service plus a separate frontend client.

## Architecture

Use two separate workspace packages:

```txt
agents-battle-royale/
├── backend/   # Bun HTTP API server
└── frontend/  # Next.js UI client
```

The backend is the source of truth. The frontend only talks to backend HTTP endpoints.

## MVP Scope

### Included

- Bun HTTP backend in `backend/`.
- In-memory backend game store.
- JWT admin login.
- JWT spectator username sessions.
- Admin-only backend endpoints for game management.
- Public backend endpoints for lobby and game details.
- Next.js frontend for public spectator views.
- Next.js frontend for admin login and dashboard.
- Basic CORS support for local frontend-to-backend requests.
- Basic validation and consistent JSON errors.

### Excluded

- Challenge submission.
- Challenge queueing.
- Skirmish scheduling.
- Agent execution.
- LLM provider integration.
- Generated code execution.
- Sandbox implementation.
- WebSockets.
- Database persistence.
- Multiple admin users.
- Spectator passwords or durable spectator accounts.
- Durable game replay.
- Production deployment hardening.

## Backend Package Plan

Create a real backend package in `backend/`.

```txt
backend/
├── package.json
├── tsconfig.json
├── index.ts
├── auth.ts
├── config.ts
├── game-store.ts
├── http.ts
├── types.ts
└── validation.ts
```

### Runtime

Use Bun's native HTTP server:

```ts
Bun.serve({
  port,
  fetch(request) {
    // route requests here
  },
});
```

No framework is required for the first MVP. If routing becomes noisy, add a lightweight router later.

### Backend Dependencies

Recommended dependencies:

```bash
pnpm --filter @agents-battle-royale/backend add jose
```

Recommended dev dependencies:

```bash
pnpm --filter @agents-battle-royale/backend add -D typescript @types/bun
```

Use `jose` for JWT signing and verification.

### Backend Scripts

`backend/package.json`:

```json
{
  "name": "@agents-battle-royale/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch index.ts",
    "start": "bun index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "jose": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "latest"
  }
}
```

Update root `package.json` scripts:

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter @agents-battle-royale/backend --filter @agents-battle-royale/frontend dev",
    "dev:backend": "pnpm --filter @agents-battle-royale/backend dev",
    "dev:frontend": "pnpm --filter @agents-battle-royale/frontend dev",
    "build": "pnpm --filter @agents-battle-royale/frontend build && pnpm --filter @agents-battle-royale/backend typecheck",
    "lint": "pnpm --filter @agents-battle-royale/frontend lint"
  }
}
```

## Backend Configuration

Environment variables:

```txt
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_TOKEN_TTL_SECONDS=86400
```

For local development, the backend may fall back to `admin` for both admin username and password plus a development-only JWT secret, but it should log a warning when doing so.

## User Identity

Every visitor must have a username before using the app.

- First-time visitors see a global sign-in modal.
- The default path is spectator sign-in with username only.
- The alternate path is admin login with username and password.
- Both modes return the same session response shape: `{ token, expiresIn, user }`.
- The frontend validates stored sessions on startup with `/auth/me`.
- Admin-only UI is shown when `user.role === "admin"`.

The MVP treats spectator usernames as display/attribution identity, not durable authenticated accounts. Admin usernames are reserved so spectators cannot impersonate the configured admin.

## Backend Data Model

Create shared backend types in `backend/types.ts`.

```ts
export type GameStatus = "draft" | "active" | "stopped";

export type AgentConfig = {
  id: string;
  name: string;
  model: string;
  description: string;
  systemPrompt: string;
};

export type Game = {
  id: string;
  name: string;
  status: GameStatus;
  agents: AgentConfig[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
};

export type GameListItem = {
  id: string;
  name: string;
  status: GameStatus;
  agentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type GameInput = {
  name: string;
  agents: Array<{
    id?: string;
    name: string;
    model: string;
    description?: string;
    systemPrompt: string;
  }>;
};
```

The MVP can expose `systemPrompt` publicly so spectators can understand the agent setup. 

## Backend Store

Create `backend/game-store.ts`.

Use a process-local in-memory `Map<string, Game>`.

Responsibilities:

- List games.
- Get a game.
- Create a game.
- Update a game.
- Delete a game.
- Start a game.
- Stop a game.
- Normalize inputs.
- Keep timestamps up to date.

Suggested functions:

```ts
export function listGames(): GameListItem[];
export function getGame(gameId: string): Game | null;
export function createGame(input: GameInput): Game;
export function updateGame(gameId: string, input: GameInput): Game | null;
export function deleteGame(gameId: string): boolean;
export function startGame(gameId: string): Game | null;
export function stopGame(gameId: string): Game | null;
```

## Validation Rules

Game validation:

- `name` is required after trimming.
- `name` max length: 80 characters.

Agent validation:

- `name` is required after trimming.
- `name` max length: 60 characters.
- `model` is required after trimming.
- `model` max length: 80 characters.
- `description` optional, max length: 240 characters.
- `systemPrompt` is required after trimming.
- `systemPrompt` max length: 4,000 characters.

Start validation:

- Game must exist.
- Game must have at least one agent.

No model allowlist is necessary yet because no provider calls are made. The frontend should still use a fixed model dropdown for a cleaner admin experience.

## Backend Authentication

Use JWTs for admin auth.

### Login

Endpoint:

```txt
POST /auth/login
```

Request body:

```ts
{
  password: string;
}
```

Behavior:

1. Compare password to `ADMIN_PASSWORD`.
2. If invalid, return `401`.
3. If valid, sign a JWT with `jose`.
4. Return the token in JSON.

Response:

```ts
{
  token: string;
  expiresIn: number;
}
```

### JWT Claims

```ts
type AdminJwtClaims = {
  sub: "admin";
  role: "admin";
};
```

Use:

- algorithm: `HS256`
- issuer: `agents-battle-royale-backend`
- subject: `admin`
- expiration: `ADMIN_TOKEN_TTL_SECONDS`

### Admin Route Auth

Admin routes require:

```txt
Authorization: Bearer <jwt>
```

The frontend should store the JWT in browser memory or local storage for the MVP. For a stronger later version, move to a backend-set HTTP-only cookie or a BFF pattern. Since the backend and frontend are separate services in this MVP, bearer tokens keep the first integration simple.

## Backend HTTP API

Use JSON for all requests and responses.

### Health

```txt
GET /health
```

Response:

```ts
{ ok: true }
```

### Public Game Routes

```txt
GET /games
GET /games/:gameId
```

`GET /games` response:

```ts
{
  games: GameListItem[];
}
```

`GET /games/:gameId` response:

```ts
{
  game: Game;
}
```

Return `404` if the game does not exist.

### Admin Routes

```txt
POST   /games
PUT    /games/:gameId
DELETE /games/:gameId
POST   /games/:gameId/start
POST   /games/:gameId/stop
```

All admin routes require bearer JWT auth.

`POST /games` body:

```ts
GameInput
```

`PUT /games/:gameId` body:

```ts
GameInput
```

`POST /games/:gameId/start` behavior:

- Set status to `active`.
- Set `startedAt` to now.
- Clear `stoppedAt`.

`POST /games/:gameId/stop` behavior:

- Set status to `stopped`.
- Set `stoppedAt` to now.

### Error Shape

All errors should use:

```ts
{
  error: {
    code: string;
    message: string;
  }
}
```

Codes:

- `BAD_REQUEST`
- `UNAUTHORIZED`
- `NOT_FOUND`
- `CONFLICT`
- `INTERNAL_ERROR`

## CORS

The Bun backend should allow the frontend origin during local development.

Headers:

```txt
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization
```

Handle `OPTIONS` preflight requests globally.

Read the allowed origin from `FRONTEND_ORIGIN`.

## Frontend Plan

The frontend remains in `frontend/` as a Next.js app.

Before editing Next code, read the installed Next.js docs in `frontend/node_modules/next/dist/docs/` as instructed by `AGENTS.md`.

### Frontend Environment

```txt
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

### Frontend Files

```txt
frontend/
├── app/
│   ├── page.tsx
│   ├── games/
│   │   └── [gameId]/
│   │       └── page.tsx
│   └── admin/
│       ├── page.tsx
│       └── login/
│           └── page.tsx
├── components/
│   ├── AdminDashboard.tsx
│   ├── GameCard.tsx
│   ├── GameForm.tsx
│   └── StatusBadge.tsx
└── lib/
    ├── api.ts
    └── types.ts
```

### Frontend API Client

Create `frontend/lib/api.ts`.

Responsibilities:

- Read `NEXT_PUBLIC_BACKEND_URL`.
- Fetch public game list.
- Fetch game detail.
- Login admin.
- Send authenticated admin mutations.
- Normalize API errors for display.

Suggested functions:

```ts
export async function fetchGames(): Promise<GameListItem[]>;
export async function fetchGame(gameId: string): Promise<Game>;
export async function loginAdmin(password: string): Promise<LoginResponse>;
export async function createGame(token: string, input: GameInput): Promise<Game>;
export async function updateGame(token: string, gameId: string, input: GameInput): Promise<Game>;
export async function deleteGame(token: string, gameId: string): Promise<void>;
export async function startGame(token: string, gameId: string): Promise<Game>;
export async function stopGame(token: string, gameId: string): Promise<Game>;
```

### Frontend Auth Storage

For the MVP, store the admin JWT in `localStorage`.

Key:

```txt
abr_admin_token
```

This is acceptable for local prototype speed. Later, replace with HTTP-only cookie auth or a BFF once deployment topology is clearer.

### Public Lobby: `/`

Purpose:

- Spectators can see available games.

Content:

- Product header.
- Link to admin dashboard.
- Game list.
- Game status.
- Agent count.
- Link to game detail.

Data source:

- Fetch `GET /games` from the Bun backend.

### Public Game Detail: `/games/[gameId]`

Purpose:

- Spectators can inspect a game and the configured agents.

Content:

- Game name.
- Status.
- Started/stopped timestamps.
- Agent roster.
- Agent model.
- Agent description.
- System prompt preview.

No challenge form yet.

### Admin Login: `/admin/login`

Purpose:

- Authenticate admin with backend JWT login.

Implementation:

- Client form.
- Calls `POST /auth/login`.
- Stores returned JWT in `localStorage`.
- Redirects to `/admin`.

### Admin Dashboard: `/admin`

Purpose:

- Manage all games.

Implementation:

- Client component because it depends on `localStorage` JWT.
- If no token exists, redirect to `/admin/login`.
- Load games from backend.
- Provide create/edit/start/stop/delete controls.

Game editor fields:

- Game name.
- Agents list.

Each agent fields:

- Name.
- Model select.
- Description.
- System prompt.

Controls:

- Add agent.
- Remove agent.
- Save.
- Start.
- Stop.
- Delete.
- Logout.

Logout behavior:

- Remove `abr_admin_token` from `localStorage`.
- Redirect to `/admin/login`.

## UI Design Direction

This is an operational dashboard and spectator interface.

Use:

- restrained layout,
- dense readable lists,
- clear status badges,
- simple forms,
- obvious admin actions,
- lucide icons where useful.

Avoid:

- marketing landing page structure,
- oversized hero sections,
- decorative SVG scenes,
- one-note purple or dark-blue palettes,
- nested cards.

## Development Commands

Install dependencies:

```bash
pnpm install
```

Run backend:

```bash
pnpm --filter @agents-battle-royale/backend dev
```

Run frontend:

```bash
pnpm --filter @agents-battle-royale/frontend dev
```

Run both:

```bash
pnpm dev
```

Verify:

```bash
pnpm --filter @agents-battle-royale/backend typecheck
pnpm --filter @agents-battle-royale/frontend build
```

## Manual Acceptance Test

1. Start backend on `http://localhost:4000`.
2. Start frontend on `http://localhost:3000`.
3. Open `/` and confirm the lobby loads.
4. Open `/admin` and confirm unauthenticated users are redirected to `/admin/login`.
5. Login with `ADMIN_PASSWORD`.
6. Create a game.
7. Add at least two agents.
8. Save the game.
9. Confirm the game appears in the public lobby.
10. Open the public game page.
11. Confirm the configured agents are visible.
12. Start the game from admin.
13. Confirm public pages show `active` after refresh.
14. Stop the game from admin.
15. Confirm public pages show `stopped` after refresh.
16. Delete the game from admin.
17. Confirm it disappears from the public lobby.

## Later Expansion Path

After this MVP is complete, expand in this order:

1. Add spectator challenge submission API and UI.
2. Add pending challenge queue to backend state.
3. Add fake skirmish simulation for live game flow without LLMs.
4. Add polling or WebSockets for live spectator updates.
5. Add the real battle state machine from `backend_plan.md`.
6. Add LLM-backed agent runner.
7. Add code execution sandbox.
8. Add persistence with a database.
9. Add production-ready auth and deployment hardening.

## Acceptance Criteria

The MVP is complete when:

- Backend is a separate Bun HTTP server in `backend/`.
- Frontend is a separate Next.js client in `frontend/`.
- Admin login uses JWT tokens.
- Admin can create, edit, start, stop, and delete games.
- Admin can configure the agents participating in each game.
- Spectators can view lobby and game detail pages without logging in.
- Frontend communicates with backend through HTTP.
- Backend stores state in memory.
- Challenge and skirmish functionality is not implemented yet.
- Backend typecheck passes.
- Frontend build passes.
