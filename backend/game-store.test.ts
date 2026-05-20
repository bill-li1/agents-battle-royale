import { afterEach, describe, expect, test } from "bun:test";
import {
  createGame,
  getGameState,
  resetGameStoreForTests,
  setAgentRunnerForTests,
  submitChallenge,
} from "./game-store";
import type { AgentRunResult } from "./agent-runner";
import type { GameInput } from "./types";
import { validateGameInput } from "./validation";

const baseGameInput: GameInput = {
  name: "Test game",
  agents: [
    {
      id: "agent-a",
      name: "Agent A",
      model: "gpt-5.4-mini",
      description: "",
      systemPrompt: "Solve exactly.",
    },
    {
      id: "agent-b",
      name: "Agent B",
      model: "gpt-5.4-mini",
      description: "",
      systemPrompt: "Solve exactly.",
    },
  ],
};

afterEach(() => {
  resetGameStoreForTests();
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForResolvedState(gameId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = getGameState(gameId);
    if (state && !state.activeSkirmish) {
      return state;
    }

    await wait(10);
  }

  throw new Error("Timed out waiting for skirmish resolution.");
}

function submitTestChallenge(gameId: string) {
  return submitChallenge(
    gameId,
    {
      prompt: "What is 2 + 2?",
      expectedAnswer: "4",
    },
    "spectator",
  );
}

describe("game-store skirmish resolution", () => {
  test("incorrect answers eliminate the answering agent", async () => {
    setAgentRunnerForTests(async ({ agent }) => ({
      answer: agent.id === "agent-a" ? "wrong" : "4",
      elapsedMs: agent.id === "agent-a" ? 10 : 20,
      error: null,
    }));

    const game = createGame(baseGameInput);
    submitTestChallenge(game.id);

    const state = await waitForResolvedState(game.id);
    expect(state.skirmishHistory[0].status).toBe("resolved");
    expect(state.agents.find((agent) => agent.id === "agent-a")?.status).toBe(
      "eliminated",
    );
    expect(state.winner?.id).toBe("agent-b");
  });

  test("runner errors cancel the skirmish when every selected agent fails", async () => {
    setAgentRunnerForTests(async () => ({
      answer: null,
      elapsedMs: 10,
      error: "runner failed",
    }));

    const game = createGame(baseGameInput);
    submitTestChallenge(game.id);

    const state = await waitForResolvedState(game.id);
    expect(state.skirmishHistory[0].status).toBe("canceled");
    expect(state.agents.every((agent) => agent.status === "active")).toBe(true);
    expect(state.winner).toBeNull();
  });

  test("all-correct skirmishes eliminate the slowest agent", async () => {
    setAgentRunnerForTests(async ({ agent }) => ({
      answer: "4",
      elapsedMs: agent.id === "agent-a" ? 25 : 10,
      error: null,
    }));

    const game = createGame(baseGameInput);
    submitTestChallenge(game.id);

    const state = await waitForResolvedState(game.id);
    const result = state.skirmishHistory[0].results.find(
      (agentResult) => agentResult.agentId === "agent-a",
    );
    expect(result?.correct).toBe(true);
    expect(result?.eliminated).toBe(true);
    expect(state.winner?.id).toBe("agent-b");
  });

  test("public active skirmish state does not expose expected answers", async () => {
    let resolveRun!: (result: AgentRunResult) => void;
    const pendingRun = new Promise<AgentRunResult>((resolve) => {
      resolveRun = resolve;
    });
    setAgentRunnerForTests(() => pendingRun);

    const game = createGame(baseGameInput);
    submitTestChallenge(game.id);

    const runningState = getGameState(game.id);
    expect(runningState?.activeSkirmish?.challenge).toEqual({
      id: expect.any(String),
      prompt: "What is 2 + 2?",
      submittedBy: "spectator",
      status: "running",
      createdAt: expect.any(String),
    });
    expect(
      "expectedAnswer" in (runningState?.activeSkirmish?.challenge ?? {}),
    ).toBe(false);

    resolveRun({ answer: "4", elapsedMs: 10, error: null });
    await waitForResolvedState(game.id);
  });
});

describe("game validation", () => {
  test("rejects unsupported model IDs", () => {
    expect(() =>
      validateGameInput({
        ...baseGameInput,
        agents: [
          { ...baseGameInput.agents[0], model: "gpt-fake" },
          baseGameInput.agents[1],
        ],
      }),
    ).toThrow("agents[0].model must be one of");
  });
});
