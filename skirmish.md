# Skirmish Implementation Plan

## Goal

Implement the next playable slice of AI Coding Agent Battle Royale:

- admins create games with configured agents,
- spectators and admins submit challenges,
- queued challenges trigger mock-agent skirmishes,
- agents are eliminated according to the game rules,
- the game ends when one agent remains.

This phase intentionally uses a mock agent runner. Do not integrate real LLM calls, generated code execution, sandboxing, provider credentials, or token streaming yet.

Games become active immediately when they are created. There is no separate start, stop, pause, or resume flow. Once created, a game stays active until it is deleted or a winner is declared.

## Current Baseline

The current app already supports:

- admin login by configured admin username/password,
- spectator login by username,
- game creation with configured agents,
- public lobby listing,
- public game detail pages,
- admin-only game deletion.

The current backend model is still simple:

- `Game` currently contains `id`, `name`, `agents`, and timestamps.
- There is no game status.
- There is no live agent status or elimination state.
- There is no challenge queue.
- There is no skirmish state or history.
- There is no winner state.

## Scope

### Included

- Backend game/skirmish state model.
- Public game state endpoint.
- Public challenge submission endpoint for signed-in users.
- In-memory challenge queue.
- One active skirmish per game.
- Mock concurrent agent runner.
- Skirmish resolution rules.
- Winner detection.
- Frontend game detail updates for state, challenge submission, roster status, active skirmish, history, and winner.
- Focused backend tests for scheduler and resolution behavior if the project test setup supports it without large tooling changes.

### Excluded

- Real LLM calls.
- Generated code execution.
- Sandboxing.
- WebSockets.
- Database persistence.
- Stop/pause/resume game controls.
- Editing agents after game creation.
- Multiple active skirmishes in one game.
- Durable replay after backend restart.

## Backend Data Model

Update backend and frontend shared types to support game and skirmish state.

### Game

Replace the current timestamp-only game shape with a stateful room:

```ts
export type GameStatus = "active" | "finished";

export type Game = {
  id: string;
  name: string;
  status: GameStatus;
  agents: Agent[];
  pendingChallenges: Challenge[];
  activeSkirmish: Skirmish | null;
  skirmishHistory: SkirmishSummary[];
  winner: Agent | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  finishedAt: string | null;
};
```

`active` means challenges can trigger skirmishes. `finished` means a winner exists and no new skirmishes should start.

### Agent

Use one product word, agent. For this MVP, the configured agent fields and runtime state live on the same object. This matches the existing code and keeps the implementation small.

```ts
export type AgentStatus = "active" | "competing" | "eliminated";

export type Agent = {
  id: string;
  name: string;
  model: string;
  description: string;
  systemPrompt: string;
  status: AgentStatus;
  eliminatedAt: string | null;
};
```

When the admin creates a game, each submitted agent is stored with `status: "active"` and `eliminatedAt: null`. Agents are not editable after game creation.

`competing` is only a temporary status while `activeSkirmish` is non-null. Once a skirmish resolves or is canceled, every selected agent must become either `active` or `eliminated` before `activeSkirmish` is cleared.

### Challenge

```ts
export type Challenge = {
  id: string;
  prompt: string;
  expectedAnswer: string;
  submittedBy: string;
  status: "queued" | "running" | "completed" | "canceled";
  createdAt: string;
};

export type ChallengePublic = Omit<Challenge, "expectedAnswer">;
```

`expectedAnswer` must never be sent to spectators or mock agents through public DTOs.

### Skirmish

```ts
export type Skirmish = {
  id: string;
  gameId: string;
  challenge: Challenge;
  agentIds: string[];
  status: "running" | "resolved" | "canceled";
  startedAt: string;
  resolvedAt: string | null;
  results: SkirmishAgentResult[];
};

export type SkirmishAgentResult = {
  agentId: string;
  answer: string | null;
  correct: boolean;
  elapsedMs: number | null;
  error: string | null;
};
```

### Public State

Keep the public state shape simple. The only field that must be hidden from normal game-state responses is `expectedAnswer`.

```ts
export type SkirmishPublic = Omit<Skirmish, "challenge"> & {
  challenge: ChallengePublic;
};

export type SkirmishSummary = SkirmishPublic;

export type GameState = {
  game: Omit<Game, "pendingChallenges" | "activeSkirmish" | "skirmishHistory">;
  agents: Agent[];
  activeSkirmish: SkirmishPublic | null;
  pendingChallenges: ChallengePublic[];
  skirmishHistory: SkirmishSummary[];
  winner: Agent | null;
};
```

Use the same public game state shape for lobby and detail views instead of maintaining a separate list-item type.

## Backend Store Changes

Continue using the in-memory `Map<string, Game>`, but move skirmish logic behind explicit store functions.

Recommended functions:

```ts
export function listGames(): GameState[];
export function getGame(gameId: string): Game | null;
export function getGameState(gameId: string): GameState | null;
export function createGame(input: GameInput): Game;
export function deleteGame(gameId: string): boolean;
export function submitChallenge(gameId: string, input: ChallengeInput): ChallengeSubmissionResult | null;
```

Internal helpers:

```ts
function maybeStartNextSkirmish(gameId: string): void;
function resolveSkirmish(gameId: string, skirmishId: string): Promise<void>;
function selectSkirmishAgents(agents: Agent[]): Agent[];
function finishGameIfWinner(game: Game): void;
```

Any mutation to game state should update `updatedAt`.

## HTTP API

### Public Routes

Keep:

```txt
GET /games
GET /games/:gameId
```

`GET /games` returns:

```ts
{
  games: GameState[];
}
```

Add:

```txt
GET  /games/:gameId/state
POST /games/:gameId/challenges
```

`GET /games/:gameId/state` returns:

```ts
{
  state: GameState;
}
```

`POST /games/:gameId/challenges` requires a valid spectator or admin session.

Request body:

```ts
{
  prompt: string;
  expectedAnswer: string;
}
```

The submitter username comes from the session token, not from the request body.

Response:

```ts
{
  challenge: ChallengePublic;
  state: GameState;
}
```

Validation:

- game must exist,
- game must not be `finished`,
- `prompt` is required after trimming,
- `prompt` max length is 2,000,
- `expectedAnswer` is required after trimming,
- `expectedAnswer` max length is 500.

If the game is `active`, queue the challenge and immediately call `maybeStartNextSkirmish`.

### Admin Routes

Keep:

```txt
POST   /games
DELETE /games/:gameId
```

No start or stop route is needed.

Create behavior:

- validate the admin session,
- validate the game input,
- require at least two agents,
- create the game with status `active`,
- initialize each agent with `status: "active"` and `eliminatedAt: null`,
- set `startedAt` to the creation timestamp,
- return the created game or state.

## Mock Agent Runner

Create a narrow runner interface now so real LLM execution can replace it later:

```ts
export type AgentRunInput = {
  agent: Agent;
  challenge: Pick<Challenge, "prompt" | "expectedAnswer">;
  signal: AbortSignal;
};

export type AgentRunResult = {
  answer: string | null;
  elapsedMs: number;
  error: string | null;
};

export async function runMockAgent(input: AgentRunInput): Promise<AgentRunResult>;
```

The mock runner should be fast enough for development, not 60 real seconds.

Recommended behavior:

- use a random delay between 250ms and 2,500ms,
- return the correct `expectedAnswer` most of the time,
- sometimes return an incorrect answer,
- rarely simulate an error,
- respect `AbortSignal`.

Use constants so tests can override or bypass randomness later.

```ts
const MOCK_MIN_DELAY_MS = 250;
const MOCK_MAX_DELAY_MS = 2500;
const MOCK_CORRECT_RATE = 0.75;
const MOCK_ERROR_RATE = 0.05;
```

For the MVP, the skirmish timeout can be a short development timeout, for example 10 seconds, behind a constant:

```ts
const SKIRMISH_TIMEOUT_MS = 10_000;
```

Do not hard-code a browser-facing claim that the timeout is 60 seconds until the backend uses the real 60-second value.

## Skirmish Scheduler

`maybeStartNextSkirmish(gameId)`:

1. Resolve the game.
2. Return if the game is not `active`.
3. Return if an active skirmish already exists.
4. Assert or treat as a bug if any agent is still `competing`.
5. Return if fewer than two agents have status `active`.
6. Return if there are no pending challenges.
7. Pop the oldest queued challenge.
8. Mark the challenge `running`.
9. Select 2-4 active agents.
10. Mark selected agents `competing`.
11. Create `activeSkirmish`.
12. Start async skirmish resolution without blocking the HTTP request.

Because there is only one active skirmish per game, the scheduler only needs to select from `active` agents. When `activeSkirmish` is null, agents should never still be `competing`.

Selection rule:

- 2 active agents: select both.
- 3 active agents: select 2 or 3 randomly.
- 4+ active agents: select a random size from 2 to 4, then select that many agents.

## Skirmish Resolution

Run selected agents concurrently through the mock runner.

Resolution rules:

1. Incorrect answer marks that agent for elimination.
2. Error marks that agent for elimination.
3. Timeout marks that agent for elimination.
4. If all selected agents answer correctly, eliminate the slowest correct agent.
5. If every selected agent would be eliminated, cancel the skirmish and restore all selected agents to `active`.
6. Otherwise, eliminate marked agents and restore surviving selected agents to `active`.
7. Mark the challenge `completed` or `canceled`.
8. Mark the skirmish `resolved` or `canceled`.
9. Append the skirmish summary to `game.skirmishHistory`.
10. Ensure no selected agent remains `competing`.
11. Clear `activeSkirmish`.
12. Check for a winner.
13. If no winner, call `maybeStartNextSkirmish` again.

Winner rule:

- If exactly one agent remains with status `active` after a skirmish resolves, set `game.status` to `finished`.
- Store the winner on `game.winner`.
- Set `finishedAt`.
- Do not start more skirmishes.

All-eliminated cancellation:

- Interpret "all agents in a skirmish are eliminated" as all selected skirmish participants, not every agent in the whole game.
- In this case, no one is eliminated.
- The challenge is canceled.
- The skirmish is recorded as canceled.
- The scheduler can continue with the next queued challenge.

## Frontend Plan

Before editing Next.js files, read the relevant installed Next.js docs in `frontend/node_modules/next/dist/docs/` per `AGENTS.md`.

### API Client

Add frontend API functions:

```ts
export async function fetchGameState(gameId: string): Promise<GameState>;
export async function submitChallenge(
  token: string,
  gameId: string,
  input: ChallengeInput,
): Promise<{ challenge: ChallengePublic; state: GameState }>;
```

Update existing types in `frontend/lib/types.ts` to match backend public DTOs.

### Lobby

Update game cards using `GameState` data. Show:

- status,
- configured agent count,
- active agent count,
- pending challenge count,
- active skirmish indicator,
- winner if finished.

Admins keep create and delete controls. No stop control should be added.

### Game Detail Page

Replace the static roster-only view with a state view:

- game title and status,
- winner banner when status is `finished`,
- challenge submission form for signed-in users,
- pending challenge list,
- active skirmish panel,
- agent roster with statuses,
- skirmish history.

The page can use polling for this phase instead of WebSockets:

- fetch state on load,
- refresh after challenge submit,
- poll every 1-2 seconds while game is active or an active skirmish exists.

### Challenge Form

Fields:

- prompt,
- expected answer.

Rules:

- disabled while submitting,
- disabled if game is finished,
- submitter is inferred from session.

## Testing Plan

If adding tests is low-friction with the current backend setup, add backend tests around pure store/scheduler functions.

Important cases:

- creating a game creates active game state and initializes agents,
- submitting challenge to active game starts a skirmish,
- incorrect mock result eliminates an agent,
- all-correct skirmish eliminates the slowest agent,
- all-selected-eliminated case cancels skirmish and restores agents,
- winner is declared when one agent remains,
- finished games reject new challenge submissions.

If the current test setup is not ready, keep scheduler helpers pure enough that tests can be added without refactoring.

## Suggested Implementation Order

1. Update backend and frontend types.
2. Refactor backend `game-store.ts` around `GameState`, `Agent`, `Challenge`, and `Skirmish`.
3. Add response conversion helpers to strip `expectedAnswer` from challenge objects.
4. Add challenge validation.
5. Add `GET /games/:gameId/state`.
6. Update `POST /games` so creation immediately creates active game state and initializes agents.
7. Add `POST /games/:gameId/challenges`.
8. Implement mock agent runner.
9. Implement scheduler and skirmish resolution.
10. Add or update backend tests if practical.
11. Update frontend API client and types.
12. Update lobby cards.
13. Update game detail page with challenge form, game state, roster, and history.
14. Run backend typecheck and frontend lint/build.

## Open Decisions

- Whether the development skirmish timeout should be 10 seconds or the real 60 seconds.
- Whether mock correctness should be fully random or seeded/deterministic per challenge for easier demos.
- Whether the existing `GET /games/:gameId` should keep returning the full internal game object or be replaced by `GET /games/:gameId/state` in the frontend.
