# Backend Implementation Plan

<context>
The Project: An AI Coding Agent Battle Royale
Goal: To build a browser-based multi-spectator game that generates AI coding agents (“competitors”) and selects the best one through a programming-challenge battle royale.
Humans don’t compete in the game. Humans just spectate and submit challenges. AI agents compete.

Background
An agent is a piece of software that runs an LLM in a loop to achieve a goal. In this case, the goal is to answer a challenge.

Challenges are programming problems with known answers. To achieve their goal of answering a challenge, competitors must be able to generate and execute code.

Examples challenges:
Question: What is the md5sum of “AI Battle Royale”?
Answer: 4359c152baed9981d7b783b6a8bf2704
Question: What is the base-16 (hex) representation of 255^10?
Answer: 0xf62c88d104d1882cf601
Question: What is 123456789 * 987654321?
Answer: 121932631112635269
Question: What is 7^77 mod 999999937?
Answer: 860842589
Question: What is the sum of the ASCII values of every character in the string "The quick brown fox jumps over the lazy dog"?
Answer: 4057
Users
There are two types of user: spectators and admins.
Spectator
Has a username, but not necessarily a password (doesn’t have to be logged in).
Can submit challenges to an active battle.
Can enqueue challenges to the next battle.
Admin
Can do everything a spectator can do, but also has to be logged in.
Can configure a battle, eg. by setting the number of competitors.
Can delete/clear enqueued challenges.
Can start a battle.
It is OK if your software only supports a single admin.
Gameplay
The admin configures a game (e.g. by setting the number of competitors) and starts it.

As the game progresses, spectators submit challenges. When a challenge is submitted, a group of 2-4 competitors are randomly selected for a skirmish.

In a skirmish, all of the competitors race to answer the challenge as quickly as possible. Competitors are eliminated according to the following rules:
Any competitors who submits an incorrect answer is eliminated.
Any competitor who has not submitted a correct answer in 60 seconds is eliminated.
If all competitors submit the correct answer within 60 seconds, the slowest competitor is eliminated.
If all competitors in a skirmish are eliminated, the skirmish is canceled and all competitors are resurrected.
This is to disincentivize challenges that are too hard, or have the wrong answers.

Competitors continue to be eliminated in skirmishes until only one competitor remains, who is crowned the winner.
</context>

## Summary

Build a Bun-based backend for the AI Coding Agent Battle Royale with one in-memory `GameManager` as the source of truth. The backend will expose HTTP routes for auth, game creation/listing, battle control, challenge submission, and state snapshots, plus WebSocket endpoints for live lobby and game updates.

The first version supports multiple games at once. Each game is created with an immutable competitor configuration, challenge queue, spectators, and skirmish scheduler. Within a single game, exactly one skirmish runs at a time. This keeps elimination order deterministic per game while still allowing multiple independent games to exist in the lobby.

## Architecture

### Runtime And Package Shape

- Add a `backend/` workspace package using Bun and TypeScript.
- Keep backend state in memory for the MVP.
- Share public DTO/event types with the frontend through a shared TypeScript module.
- Use environment variables for secrets and provider credentials.

Proposed structure:

```txt
backend/
├── backend_plan.md
├── package.json
├── tsconfig.json
├── index.ts
├── game/
│   ├── GameManager.ts
│   ├── agent.ts
│   ├── executor.ts
│   ├── competitors.ts
│   └── ids.ts
├── routes/
│   ├── auth.ts
│   ├── games.ts
│   ├── battle.ts
│   ├── challenges.ts
│   └── state.ts
├── shared/
│   └── types.ts
└── test/
    ├── GameManager.test.ts
    ├── battleLifecycle.test.ts
    └── executor.test.ts
```

### Core Design

`GameManager` owns the game registry and lobby-level connections. Each `GameRoom` owns mutable state for one game:

```ts
class GameManager {
  games: Map<string, GameRoom>;
  lobbySpectators: Set<ServerWebSocket>;
}

type GameRoom = {
  id: string;
  name: string;
  status: GameRoomStatus;
  config: BattleConfig;
  battle: Battle | null;
  activeSkirmish: Skirmish | null;
  pendingChallenges: Challenge[];
  spectators: Set<ServerWebSocket>;
  seq: number;
  createdAt: string;
  updatedAt: string;
};
```

HTTP routes validate requests and call `GameManager` methods with a `gameId` where appropriate. They should not directly mutate game, battle, competitor, challenge, or skirmish state.

Agent execution and code execution stay behind narrow functional interfaces:

```ts
runAgentForChallenge(input): Promise<AgentResult>
executeCode(input, signal): Promise<ExecutionResult>
```

## Public Types

Define public frontend-safe types in `backend/shared/types.ts`.

### Game Room

```ts
type GameRoomStatus = "configuring" | "active" | "finished" | "stopped";

type GameRoom = {
  id: string;
  name: string;
  status: GameRoomStatus;
  config: BattleConfig;
  battle: Battle | null;
  activeSkirmish: Skirmish | null;
  pendingChallenges: Challenge[];
  createdAt: string;
  updatedAt: string;
};
```

The lobby only needs a lightweight public list item:

```ts
type GameListItem = {
  id: string;
  name: string;
  status: GameRoomStatus;
  totalCompetitorCount: number;
  activeCompetitorCount: number;
  pendingChallengeCount: number;
  hasActiveSkirmish: boolean;
  winner: CompetitorPublic | null;
  createdAt: string;
  updatedAt: string;
};
```

### Battle

```ts
type BattleStatus = "configuring" | "active" | "finished" | "stopped";

type Battle = {
  id: string;
  status: BattleStatus;
  config: BattleConfig;
  competitors: Competitor[];
  skirmishHistory: SkirmishSummary[];
  winner: CompetitorPublic | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};
```

### Battle Configuration

```ts
type BattleConfig = {
  competitors: CompetitorConfig[];
};
```

The admin configures concrete competitors when creating the game. After the game is created, this configuration is immutable: competitors cannot be edited, added, or removed from that game. `startBattle(gameId)` snapshots the already-stored game config into the `Battle` object.

```ts
type CompetitorConfig = {
  name: string;
  model: string;
  systemPrompt: string;
  publicDescription?: string;
  temperature?: number;
  maxOutputTokens?: number;
};
```

Recommended defaults:

- `model`: use `gpt-4.1-mini` or the configured default model.
- `systemPrompt`: a backend-provided default coding-agent prompt.
- `publicDescription`: a short spectator-facing personality/strategy label.
- `temperature`: `0.2`.
- `maxOutputTokens`: `1500`.

The admin UI should submit the full competitor list when creating the game. Optional quick-start tooling may generate default configs from a count before calling `POST /games`, but the backend should still store only a resolved immutable `CompetitorConfig[]`.

### Competitor

```ts
type CompetitorStatus = "active" | "competing" | "eliminated";

type Competitor = {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  publicDescription: string | null;
  temperature: number;
  maxOutputTokens: number;
  status: CompetitorStatus;
  eliminatedAt: string | null;
};
```

Competitors are created from admin-provided `CompetitorConfig` values when a battle starts. The live `Competitor` stores the model and prompt actually used for that battle so the battle is reproducible for the lifetime of the process.

Frontend-facing competitor DTOs should include `name`, `model`, `publicDescription`, `status`, and elimination metadata. They should not expose the full `systemPrompt` unless an admin-only endpoint explicitly requests it.

### Challenge

```ts
type Challenge = {
  id: string;
  prompt: string;
  expectedAnswer: string;
  submittedBy: string;
  status: "queued" | "running" | "completed" | "canceled";
  createdAt: string;
};
```

Important: `expectedAnswer` is never sent to spectators or agents.

Frontend-facing challenge DTO:

```ts
type ChallengePublic = Omit<Challenge, "expectedAnswer">;
```

### Skirmish

```ts
type Skirmish = {
  id: string;
  battleId: string;
  challenge: Challenge;
  competitorIds: string[];
  status: "running" | "resolved" | "canceled";
  startedAt: string;
  resolvedAt: string | null;
  results: SkirmishCompetitorResult[];
};
```

```ts
type SkirmishCompetitorResult = {
  competitorId: string;
  answer: string | null;
  correct: boolean;
  elapsedMs: number | null;
  error: string | null;
};
```

### State Snapshot

`GET /games/:gameId/state` returns the full frontend-safe state for one game:

```ts
type GameState = {
  game: GamePublic;
  battle: BattlePublic | null;
  activeSkirmish: SkirmishPublic | null;
  pendingChallenges: ChallengePublic[];
  seq: number;
};
```

`seq` is a monotonically increasing per-game event counter used by clients to detect missed live updates.

`GET /games` returns the lobby list:

```ts
type GameListResponse = {
  games: GameListItem[];
};
```

## HTTP API

### Product Access Model

There should not be separate admin and spectator page hierarchies. Spectators and admins use the same lobby and game pages:

- In the lobby, everyone can see the same game list.
- Authenticated admins additionally see the create-game control.
- The shared page should have a top-right login button for admins.
- After successful admin login, the same page reveals admin-only controls instead of navigating to a separate admin area.
- Inside a game, everyone can watch the same live state and submit challenges.
- Authenticated admins additionally see game controls such as start, stop, and clear queue.
- The backend enforces this through admin-only HTTP routes; the frontend only hides or shows controls based on auth state.

This is mostly a frontend concern and can be deferred for MVP UI work, but the backend API should continue to support the shared-page model rather than separate admin-only resources.

### Public Routes

```txt
GET  /games
GET  /games/:gameId/state
POST /games/:gameId/challenges/submit
POST /games/:gameId/challenges/enqueue
GET  /lobby/ws
GET  /games/:gameId/ws
```

For MVP, `/challenges/submit` and `/challenges/enqueue` can share the same queue behavior:

- If the game's battle is active, the challenge enters that game's active pending queue.
- If the game has no active battle, the challenge remains queued for that game's next battle.
- The frontend can present these differently, but the backend can store them in the same queue initially.

`POST /games/:gameId/challenges/submit` body:

```ts
{
  username: string;
  prompt: string;
  expectedAnswer: string;
}
```

Validation:

- `username`: required, trimmed, max 40 characters.
- `prompt`: required, trimmed, max 2,000 characters.
- `expectedAnswer`: required, trimmed, max 500 characters.
- Reject empty strings after trim.

Response:

```ts
{
  challenge: ChallengePublic;
  state: GameState;
}
```

### Admin Routes

```txt
POST   /auth/login
POST   /games
POST   /games/:gameId/battle/start
POST   /games/:gameId/battle/stop
DELETE /games/:gameId/challenges/queue
DELETE /games/:gameId/challenges/:id
```

`POST /auth/login`:

- Accept one admin password from `ADMIN_PASSWORD`.
- Return a signed JWT or signed opaque token.
- Use `Authorization: Bearer <token>` for admin routes.
- A single admin account is sufficient.
- Admin permissions are global. Any authenticated admin can create, start, stop, or clear queues for any game; there is no creator ownership model in v1.

`POST /games` body:

```ts
{
  name: string;
  competitors: CompetitorConfig[];
}
```

Validation:

- Admin only.
- `name` is required, trimmed, and max 80 characters.
- Recommended competitor count range: 4 to 32.
- Each competitor name is required, trimmed, and max 60 characters.
- Each competitor model is required and must be in an allowlist of supported backend model IDs.
- Each competitor system prompt is required, trimmed, and max 4,000 characters.
- `publicDescription`, if provided, is trimmed and max 240 characters.
- `temperature`, if provided, must be between 0 and 2.
- `maxOutputTokens`, if provided, must be between 256 and 4,000.
- Store the full resolved competitor configuration immutably on the game.
- Create a new `GameRoom` with status `"configuring"`.
- Broadcast a lobby event so connected clients see the new game.
- Do not create or start the battle yet.

`POST /games/:gameId/battle/start`:

- Creates a new battle for that game if none exists or if the previous battle is `"finished"` or `"stopped"`.
- Creates competitors from the immutable game `CompetitorConfig[]`.
- Sets battle status to `"active"`.
- Sets the game room status to `"active"`.
- Calls `maybeStartNextSkirmish(gameId)` after starting.
- Broadcasts both a game event and a lobby update.

`POST /games/:gameId/battle/stop`:

- Admin only.
- Stops the active battle for that game, regardless of which admin created it.
- Aborts the active skirmish if one is running.
- Marks the battle and game room as `"stopped"`.
- Restores no competitors and declares no winner.
- Broadcasts `battle:stopped` to that game's WebSocket clients.
- Broadcasts a lobby update so the game list reflects the stopped state.

`DELETE /games/:gameId/challenges/queue`:

- Admin clears all pending challenges for that game.
- Active skirmish is not affected.

`DELETE /games/:gameId/challenges/:id`:

- Admin deletes one queued challenge if it is still pending.
- If the challenge is already running or completed, return a 409 conflict.

## WebSocket Events

Use two WebSocket scopes:

- `GET /lobby/ws` sends lobby-level game list changes.
- `GET /games/:gameId/ws` sends events for one specific game.

All game-scoped server-to-client events include `gameId`, `seq`, and state-safe payloads.

```ts
type LobbyEvent =
  | { type: "lobby:snapshot"; games: GameListItem[] }
  | { type: "game:created"; game: GameListItem }
  | { type: "game:updated"; game: GameListItem };

type GameEvent =
  | { gameId: string; seq: number; type: "state:snapshot"; state: GameState }
  | { gameId: string; seq: number; type: "challenge:queued"; challenge: ChallengePublic }
  | { gameId: string; seq: number; type: "battle:started"; battle: BattlePublic }
  | { gameId: string; seq: number; type: "battle:stopped"; battle: BattlePublic | null }
  | { gameId: string; seq: number; type: "skirmish:started"; skirmish: SkirmishPublic }
  | { gameId: string; seq: number; type: "competitor:started"; skirmishId: string; competitorId: string }
  | { gameId: string; seq: number; type: "competitor:tool_call"; skirmishId: string; competitorId: string }
  | { gameId: string; seq: number; type: "competitor:answered"; skirmishId: string; competitorId: string; correct: boolean; elapsedMs: number | null }
  | { gameId: string; seq: number; type: "competitor:eliminated"; competitor: CompetitorPublic }
  | { gameId: string; seq: number; type: "skirmish:resolved"; skirmish: SkirmishSummary }
  | { gameId: string; seq: number; type: "skirmish:canceled"; skirmish: SkirmishSummary }
  | { gameId: string; seq: number; type: "battle:winner"; competitor: CompetitorPublic };
```

Do not stream raw model tokens in v1. Status-level events are enough for spectator engagement and simpler to render.

On lobby WebSocket connect:

- Add socket to `lobbySpectators`.
- Immediately send `lobby:snapshot`.
- Remove socket on close.

On game WebSocket connect:

- Validate that `gameId` exists.
- Add socket to that game's `spectators`.
- Immediately send that game's `state:snapshot`.
- Remove socket on close.

If a send fails, remove that socket from the set.

## GameManager Behavior

### Game Creation

`createGame(input)`:

1. Verify the caller is an admin.
2. Validate and normalize the game name.
3. Validate the full competitor configuration.
4. Create a `GameRoom` with status `"configuring"`.
5. Store the resolved competitor configuration immutably on the game.
6. Add it to `games`.
7. Broadcast `game:created` to lobby WebSocket clients.
8. Return the new `GameListItem` and, if needed, full `GameState`.

### Game Lookup

Every game-scoped method starts by resolving `gameId` from `games`.

- If the game does not exist, return `404 NOT_FOUND`.
- Public spectators can read any game and submit challenges to any game.
- Admins can create, start, stop, and clear queues for any game.
- No API supports editing a game's competitors after creation.

### Battle Start

`startBattle(gameId)`:

1. Resolve the game room.
2. Verify no battle is currently active for that game.
3. Create competitors from the game's immutable names, models, prompts, and generation settings.
4. Create a `Battle` with status `"active"` and attach it to the game.
5. Set the game room status to `"active"`.
6. Broadcast `battle:started` to that game's WebSocket clients.
7. Broadcast `game:updated` to lobby WebSocket clients.
8. Call `maybeStartNextSkirmish(gameId)`.

### Battle Stop

`stopBattle(gameId)`:

1. Resolve the game room.
2. If an active skirmish exists, abort its `AbortController`.
3. Mark the active skirmish as `"canceled"` or discard it if no results should be shown.
4. Mark the battle and game room as `"stopped"`.
5. Clear `activeSkirmish`.
6. Leave pending challenges in the queue unless the admin separately clears them.
7. Broadcast `battle:stopped` to that game's WebSocket clients.
8. Broadcast `game:updated` to lobby WebSocket clients.

### Challenge Submission

`submitChallenge(gameId, input)`:

1. Resolve the game room.
2. Validate and normalize input.
3. Create a `Challenge`.
4. Push it to that game's `pendingChallenges`.
5. Broadcast `challenge:queued` to that game's WebSocket clients.
6. Broadcast `game:updated` to lobby WebSocket clients so queue counts update.
7. Call `maybeStartNextSkirmish(gameId)`.
8. Return public challenge and game state snapshot.

### Skirmish Scheduler

`maybeStartNextSkirmish(gameId)`:

1. Resolve the game room.
2. Return if no active battle exists for that game.
3. Return if that game's `activeSkirmish` is not null.
4. Return if battle status is not `"active"`.
4. Return if fewer than 2 active competitors remain.
5. Return if that game's `pendingChallenges` is empty.
6. Pop the oldest pending challenge from that game.
7. Select 2-4 active competitors at random.
8. Mark selected competitors as `"competing"`.
9. Create that game's `activeSkirmish`.
10. Broadcast `skirmish:started` to that game's WebSocket clients.
11. Start async skirmish execution.
12. Do not block the HTTP request that triggered scheduling.

Selection rule:

- If 2 active competitors remain, select both.
- If 3 active competitors remain, select 2 or 3 randomly.
- If 4+ active competitors remain, select a random size from 2 to 4, then select that many competitors.

### Skirmish Resolution

Each selected competitor runs concurrently with a 60-second limit.

Resolution rules:

1. Incorrect answer means that competitor is marked for elimination.
2. Timeout means that competitor is marked for elimination.
3. If all competitors answer correctly within 60 seconds, eliminate the slowest correct competitor.
4. If every selected competitor would be eliminated, cancel the skirmish and restore all selected competitors to `"active"`.
5. Otherwise, eliminate marked competitors and restore remaining selected competitors to `"active"`.
6. Append a `SkirmishSummary` to `battle.skirmishHistory`.
7. Clear that game's `activeSkirmish`.
8. Check for winner.
9. Broadcast `game:updated` to lobby clients so counts/statuses stay current.
10. If no winner, call `maybeStartNextSkirmish(gameId)`.

Winner rule:

- If exactly one competitor has status `"active"` or `"competing"` after a resolved skirmish, mark battle `"finished"` and broadcast `battle:winner`.

### All-Eliminated Cancellation

For the all-eliminated case:

- Mark challenge status `"canceled"`.
- Mark skirmish status `"canceled"`.
- Restore selected competitors to `"active"`.
- Append canceled skirmish summary to history.
- Broadcast `skirmish:canceled`.
- Do not eliminate anyone.
- Continue to the next queued challenge.

This interprets "all competitors in a skirmish are eliminated" as only the participants in that skirmish, not every competitor in the battle.

## Agent Runner

`agent.ts` owns LLM interaction.

Input:

```ts
type RunAgentInput = {
  competitor: Competitor;
  challengePrompt: string;
  signal: AbortSignal;
  onEvent: (event: AgentRuntimeEvent) => void;
};
```

Output:

```ts
type AgentResult = {
  competitorId: string;
  answer: string | null;
  elapsedMs: number;
  error: string | null;
};
```

Behavior:

- Use Vercel AI SDK `generateText`.
- Instantiate the requested model from `competitor.model` through an allowlisted provider/model mapping.
- Use `competitor.systemPrompt` as the primary system prompt for that competitor.
- Pass `competitor.temperature` and `competitor.maxOutputTokens` into the generation options.
- Provide the challenge prompt.
- Register one tool: `executeCode`.
- The agent must return a final answer string.
- Trim the answer before comparison.
- Propagate `AbortSignal` to model call and code execution.
- Emit runtime events for:
  - started
  - tool call
  - answer submitted
  - timeout/error

Do not include `expectedAnswer` anywhere in the agent prompt, tool input, logs sent to clients, or WebSocket payloads.

The backend should not accept arbitrary provider strings directly from the client. Admin-configured `model` values should be stable IDs from an allowlist, for example:

```ts
const MODEL_REGISTRY = {
  "gpt-4.1-mini": openai("gpt-4.1-mini"),
  "gpt-4.1": openai("gpt-4.1"),
};
```

If a model ID is removed or unavailable, reject game creation rather than silently substituting a different model.

## Code Executor

`executor.ts` is the highest-risk component and should stay narrow.

Preferred MVP sandbox:

- Run generated code through Deno with restrictive permissions.
- Use no network, no filesystem, no environment, no subprocess, no FFI.
- Add a wall-clock timeout.
- Limit stdout/stderr size.
- Return only text output and structured error metadata.

Example execution policy:

```txt
deno run
  --no-net
  --no-read
  --no-write
  --no-env
  --no-ffi
  --no-run
```

Executor input:

```ts
type ExecuteCodeInput = {
  code: string;
  language: "typescript" | "javascript";
  signal: AbortSignal;
};
```

Executor output:

```ts
type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};
```

Limits:

- Code length max: 10,000 characters.
- Timeout: 5 seconds per tool execution.
- Output max: 20,000 characters combined stdout/stderr.
- No secrets or provider environment variables available to the subprocess.
- Temporary files should be created outside repo-tracked paths and removed after execution.

If Deno is unavailable, fallback is a Bun child process with timeout and output limits, but this is not a real sandbox. Treat that fallback as local-demo-only.

## Error Handling

Use consistent JSON error responses:

```ts
{
  error: {
    code: string;
    message: string;
  }
}
```

Recommended codes:

```txt
BAD_REQUEST
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
BATTLE_NOT_ACTIVE
NO_ACTIVE_COMPETITORS
INTERNAL_ERROR
```

HTTP status mapping:

- `400`: validation errors
- `401`: missing/invalid admin token
- `403`: valid user but not allowed
- `404`: missing resource
- `409`: invalid state transition
- `500`: unexpected failure

Do not expose raw LLM/provider errors or executor internals to spectators.

## Authentication

Admin authentication:

- `ADMIN_PASSWORD` required in production-like usage.
- `JWT_SECRET` required for token signing.
- `POST /auth/login` returns a token when password matches.
- Admin middleware verifies bearer token.
- No spectator login needed.

Spectator identity:

- Accept a `username` field on challenge submission.
- No password.
- No persistence.
- The frontend may store username locally.

## Configuration

Required environment variables:

```txt
ADMIN_PASSWORD=
JWT_SECRET=
OPENAI_API_KEY= or provider-specific key
```

Optional environment variables:

```txt
PORT=4000
DEFAULT_COMPETITOR_COUNT=10
MAX_COMPETITOR_COUNT=32
SKIRMISH_TIMEOUT_MS=60000
EXECUTOR_TIMEOUT_MS=5000
MAX_PENDING_CHALLENGES=100
MAX_ACTIVE_GAMES=25
```

Defaults should be safe for local development.

## Testing Plan

### Unit Tests

`GameManager`:

- Creates multiple independent games.
- Lists active/configuring/finished/stopped games for the lobby.
- Stores immutable admin-provided competitor configuration at game creation.
- Starts a battle from the game's immutable competitors.
- Rejects starting a battle while that game's battle is active.
- Stops any game as an authenticated admin, regardless of creator.
- Queues challenges per game.
- Starts only one skirmish at a time per game.
- Selects 2-4 competitors.
- Restores non-eliminated competitors after a skirmish.
- Eliminates incorrect competitors.
- Eliminates timed-out competitors.
- Eliminates slowest competitor when all are correct.
- Cancels skirmish and resurrects participants when all would be eliminated.
- Declares winner when one competitor remains.
- Does not expose `expectedAnswer` in public state.

Routes:

- `GET /games` returns safe lobby DTOs.
- Public game state endpoint returns safe DTOs.
- Admin routes reject missing/invalid tokens.
- Admin routes are not scoped to game creators.
- Game creation rejects invalid competitor models and prompts.
- Challenge validation rejects empty or oversized fields.
- Queue clear removes pending challenges only.

Executor:

- Executes simple arithmetic code.
- Times out infinite loops.
- Truncates excessive output.
- Rejects oversized code.
- Does not expose environment variables under the Deno sandbox.

### Integration Tests

- Create two games and verify their queues, battles, skirmishes, and `seq` counters do not interfere.
- Submit a challenge to a game while no skirmish is active and verify one starts in that game.
- Submit multiple challenges to one game and verify they run sequentially.
- Connect lobby WebSocket and verify initial `lobby:snapshot`.
- Connect game WebSocket and verify initial `state:snapshot`.
- Verify game event ordering by increasing per-game `seq`.
- Verify refresh/reconnect can recover state via `GET /games/:gameId/state`.
- Verify lobby reconnect can recover the game list via `GET /games`.

### Manual Acceptance Scenarios

- Non-admin opens the lobby and sees all available games.
- Admin opens the same lobby and sees all games plus create controls.
- Admin enters the same game page as spectators and sees start/stop/clear controls.
- Admin creates a game with 10 competitors, including names, models, and system prompts, then starts a battle.
- Spectator enters that game and submits a challenge.
- UI sees `challenge:queued`, `skirmish:started`, competitor progress events, and `skirmish:resolved`.
- Repeated challenges eventually produce a winner.
- Admin can stop any active game, even if another admin created it.
- Admin can clear queued challenges for a game without interrupting active skirmish.
- Bad challenge where all participants fail cancels the skirmish and restores participants.

## Implementation Milestones

1. Backend package setup with Bun, TypeScript, and workspace scripts.
2. Shared types and DTO helpers.
3. Multi-game `GameManager` state machine and immutable game creation without real LLM calls.
4. HTTP router and admin auth.
5. WebSocket connection management and event broadcast.
6. Deterministic fake agent runner for testing game flow.
7. Real Vercel AI SDK agent runner using per-competitor model and prompt settings.
8. Deno-based executor.
9. Tests for lifecycle, queueing, elimination, and public state safety.
10. Frontend integration against `GET /games`, `GET /games/:gameId/state`, lobby WebSocket events, and game WebSocket events.

## Assumptions

- The MVP is single-process and stores all game state in memory.
- Multiple games can exist at once.
- Only one active skirmish runs at a time within a single game.
- Other active competitors in the same game effectively spectate while a skirmish runs.
- The all-eliminated resurrection rule restores only that skirmish's participants.
- Spectators do not authenticate.
- A single admin password is sufficient.
- Admin permissions are global across all games; game creator ownership is out of scope.
- Admins and spectators use the same lobby and game pages; auth only controls which actions are available.
- Admins configure explicit competitor names, model IDs, system prompts, and optional generation settings when creating a game.
- A game's competitor configuration is immutable after creation.
- Model IDs are selected from a backend allowlist, not arbitrary provider strings.
- Deno is the preferred executor sandbox for generated code.
- Raw LLM token streaming is out of scope for v1.
- Challenge answers are exact string matches after trimming whitespace.
- Persistence, multi-server scaling, durable replay, and production-grade sandboxing are out of scope for the first backend version.
