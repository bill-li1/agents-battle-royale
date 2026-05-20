import { runAgent, type AgentRunner } from "./agent-runner";
import { config } from "./config";
import type {
  Agent,
  BackendStateSnapshot,
  Challenge,
  ChallengeInput,
  ChallengePublic,
  ChallengeSubmissionResult,
  Game,
  GameInput,
  GameState,
  Skirmish,
  SkirmishAgentResult,
  SkirmishPublic,
  SkirmishSummary,
} from "./types";

const games = new Map<string, Game>();
let agentRunner: AgentRunner = runAgent;

function now() {
  return new Date().toISOString();
}

function touch(game: Game) {
  game.updatedAt = now();
}

function normalizeAgents(agents: GameInput["agents"]): Agent[] {
  return agents.map((agent) => ({
    id: agent.id ?? crypto.randomUUID(),
    name: agent.name,
    model: agent.model,
    description: agent.description ?? "",
    systemPrompt: agent.systemPrompt,
    status: "active",
    eliminatedAt: null,
  }));
}

function toPublicChallenge(challenge: Challenge): ChallengePublic {
  return {
    id: challenge.id,
    prompt: challenge.prompt,
    submittedBy: challenge.submittedBy,
    status: challenge.status,
    createdAt: challenge.createdAt,
  };
}

function toPublicSkirmish(skirmish: Skirmish): SkirmishPublic {
  return {
    id: skirmish.id,
    gameId: skirmish.gameId,
    challenge: toPublicChallenge(skirmish.challenge),
    agentIds: [...skirmish.agentIds],
    status: skirmish.status,
    startedAt: skirmish.startedAt,
    resolvedAt: skirmish.resolvedAt,
    results: skirmish.results.map((result) => ({ ...result })),
  };
}

function toSkirmishSummary(skirmish: Skirmish): SkirmishSummary {
  return {
    ...toPublicSkirmish(skirmish),
  };
}

function normalizeAnswer(answer: string | null): string {
  return answer?.trim() ?? "";
}

export function getGameState(gameId: string): GameState | null {
  const game = games.get(gameId);
  if (!game) {
    return null;
  }

  return toGameState(game);
}

function toGameState(game: Game): GameState {
  const agents = game.agents.map((agent) => ({ ...agent }));
  const winner = game.winner ? { ...game.winner } : null;

  return {
    game: {
      id: game.id,
      name: game.name,
      status: game.status,
      agents,
      winner,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
    },
    agents,
    activeSkirmish: game.activeSkirmish
      ? toPublicSkirmish(game.activeSkirmish)
      : null,
    pendingChallenges: game.pendingChallenges.map(toPublicChallenge),
    skirmishHistory: game.skirmishHistory.map((skirmish) => ({
      ...skirmish,
      agentIds: [...skirmish.agentIds],
      challenge: { ...skirmish.challenge },
      results: skirmish.results.map((result) => ({ ...result })),
    })),
    winner,
  };
}

export function listGames(): GameState[] {
  return [...games.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(toGameState);
}

export function getGame(gameId: string): Game | null {
  return games.get(gameId) ?? null;
}

export function getBackendStateSnapshot(): BackendStateSnapshot {
  return {
    generatedAt: now(),
    gameCount: games.size,
    games: listGames(),
  };
}

export function logBackendState(): BackendStateSnapshot {
  const snapshot = getBackendStateSnapshot();
  console.log("Backend state snapshot", JSON.stringify(snapshot, null, 2));
  return snapshot;
}

export function setAgentRunnerForTests(runner: AgentRunner) {
  agentRunner = runner;
}

export function resetGameStoreForTests() {
  games.clear();
  agentRunner = runAgent;
}

export function createGame(input: GameInput): Game {
  const timestamp = now();
  const game: Game = {
    id: crypto.randomUUID(),
    name: input.name,
    status: "active",
    agents: normalizeAgents(input.agents),
    pendingChallenges: [],
    activeSkirmish: null,
    skirmishHistory: [],
    winner: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    finishedAt: null,
  };

  games.set(game.id, game);
  return game;
}

export function deleteGame(gameId: string): boolean {
  return games.delete(gameId);
}

export function submitChallenge(
  gameId: string,
  input: ChallengeInput,
  submittedBy: string,
): ChallengeSubmissionResult | null {
  const game = games.get(gameId);
  if (!game || game.status === "finished") {
    return null;
  }

  const challenge: Challenge = {
    id: crypto.randomUUID(),
    prompt: input.prompt,
    expectedAnswer: input.expectedAnswer,
    submittedBy,
    status: "queued",
    createdAt: now(),
  };

  game.pendingChallenges.push(challenge);
  touch(game);
  maybeStartNextSkirmish(gameId);

  return {
    challenge: toPublicChallenge(challenge),
    state: toGameState(game),
  };
}

export function deleteQueuedChallenge(
  gameId: string,
  challengeId: string,
):
  | { status: "deleted"; state: GameState }
  | { status: "game_not_found" | "challenge_not_found" | "not_queued" } {
  const game = games.get(gameId);
  if (!game) {
    return { status: "game_not_found" };
  }

  const challengeIndex = game.pendingChallenges.findIndex(
    (challenge) => challenge.id === challengeId,
  );
  if (challengeIndex >= 0) {
    game.pendingChallenges.splice(challengeIndex, 1);
    touch(game);
    return { status: "deleted", state: toGameState(game) };
  }

  const isKnownChallenge =
    game.activeSkirmish?.challenge.id === challengeId ||
    game.skirmishHistory.some(
      (skirmish) => skirmish.challenge.id === challengeId,
    );

  return { status: isKnownChallenge ? "not_queued" : "challenge_not_found" };
}

function maybeStartNextSkirmish(gameId: string): void {
  const game = games.get(gameId);
  if (!game || game.status !== "active" || game.activeSkirmish) {
    return;
  }

  const activeAgents = game.agents.filter((agent) => agent.status === "active");
  if (activeAgents.length < 2 || game.pendingChallenges.length === 0) {
    finishGameIfWinner(game);
    return;
  }

  const challenge = game.pendingChallenges.shift();
  if (!challenge) {
    return;
  }

  challenge.status = "running";
  const selectedAgents = selectSkirmishAgents(activeAgents);
  for (const agent of selectedAgents) {
    agent.status = "competing";
  }

  const skirmish: Skirmish = {
    id: crypto.randomUUID(),
    gameId: game.id,
    challenge,
    agentIds: selectedAgents.map((agent) => agent.id),
    status: "running",
    startedAt: now(),
    resolvedAt: null,
    results: [],
  };

  game.activeSkirmish = skirmish;
  touch(game);
  void resolveSkirmish(gameId, skirmish.id);
}

function selectSkirmishAgents(agents: Agent[]): Agent[] {
  const shuffled = [...agents].sort(() => Math.random() - 0.5);
  const maxSize = Math.min(4, shuffled.length);
  const minSize = 2;
  const size =
    shuffled.length === 2
      ? 2
      : minSize + Math.floor(Math.random() * (maxSize - minSize + 1));

  return shuffled.slice(0, size);
}

async function resolveSkirmish(gameId: string, skirmishId: string) {
  const game = games.get(gameId);
  const skirmish = game?.activeSkirmish;
  if (!game || !skirmish || skirmish.id !== skirmishId) {
    return;
  }

  const selectedAgents = skirmish.agentIds
    .map((agentId) => game.agents.find((agent) => agent.id === agentId))
    .filter((agent): agent is Agent => Boolean(agent));

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Skirmish timed out.")),
    config.skirmishTimeoutMs,
  );

  const results = await Promise.all(
    selectedAgents.map(async (agent) => {
      const result = await agentRunner({
        agent,
        challenge: {
          prompt: skirmish.challenge.prompt,
        },
        signal: controller.signal,
      });

      return {
        agentId: agent.id,
        answer: result.answer,
        correct:
          normalizeAnswer(result.answer) ===
          normalizeAnswer(skirmish.challenge.expectedAnswer),
        eliminated: false,
        elapsedMs: result.elapsedMs,
        error: result.error,
      } satisfies SkirmishAgentResult;
    }),
  );

  clearTimeout(timeout);

  const currentGame = games.get(gameId);
  if (!currentGame || currentGame.activeSkirmish?.id !== skirmishId) {
    return;
  }

  applySkirmishResults(currentGame, skirmish, selectedAgents, results);
  maybeStartNextSkirmish(gameId);
}

function applySkirmishResults(
  game: Game,
  skirmish: Skirmish,
  selectedAgents: Agent[],
  results: SkirmishAgentResult[],
) {
  const resolvedAt = now();
  const eliminatedAgentIds = new Set<string>();

  for (const result of results) {
    if (!result.correct || result.error) {
      eliminatedAgentIds.add(result.agentId);
    }
  }

  if (eliminatedAgentIds.size === 0) {
    const slowest = [...results].sort(
      (left, right) => (right.elapsedMs ?? 0) - (left.elapsedMs ?? 0),
    )[0];
    if (slowest) {
      eliminatedAgentIds.add(slowest.agentId);
    }
  }

  const allSelectedEliminated =
    selectedAgents.length > 0 &&
    selectedAgents.every((agent) => eliminatedAgentIds.has(agent.id));

  skirmish.resolvedAt = resolvedAt;

  if (allSelectedEliminated) {
    skirmish.results = results.map((result) => ({
      ...result,
      eliminated: false,
    }));
    skirmish.status = "canceled";
    skirmish.challenge.status = "canceled";
    for (const agent of selectedAgents) {
      agent.status = "active";
      agent.eliminatedAt = null;
    }
  } else {
    skirmish.results = results.map((result) => ({
      ...result,
      eliminated: eliminatedAgentIds.has(result.agentId),
    }));
    skirmish.status = "resolved";
    skirmish.challenge.status = "completed";
    for (const agent of selectedAgents) {
      if (eliminatedAgentIds.has(agent.id)) {
        agent.status = "eliminated";
        agent.eliminatedAt = resolvedAt;
      } else {
        agent.status = "active";
      }
    }
  }

  game.skirmishHistory.push(toSkirmishSummary(skirmish));
  game.activeSkirmish = null;
  finishGameIfWinner(game);
  touch(game);
}

function finishGameIfWinner(game: Game) {
  if (game.status !== "active") {
    return;
  }

  const activeAgents = game.agents.filter((agent) => agent.status === "active");
  if (activeAgents.length !== 1) {
    return;
  }

  const timestamp = now();
  game.status = "finished";
  game.winner = { ...activeAgents[0] };
  game.finishedAt = timestamp;
  game.pendingChallenges = [];
  touch(game);
}
