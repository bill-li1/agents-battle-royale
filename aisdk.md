# AI SDK Integration Plan

## Goal

Replace the current mock skirmish runner with a real Vercel AI SDK agent runner that calls OpenAI models, lets agents use a Vercel Sandbox-backed code execution tool, and uses the returned answers to resolve skirmishes.

The current skirmish state machine is already implemented in `backend/game-store.ts`. It starts one skirmish at a time, runs selected agents concurrently, compares answers to the expected answer, eliminates incorrect or slow agents, cancels all-failed skirmishes, and advances to the next queued challenge.

The remaining work is to replace `backend/mock-agent.ts` with a real runner and add the missing model registry, validation, execution tool, timeout configuration, and tests.

## Current State

- `backend/game-store.ts` imports `runMockAgent` from `backend/mock-agent.ts`.
- `runMockAgent` receives the challenge prompt and `expectedAnswer`, then randomly returns either the expected answer or an incorrect mock answer.
- Skirmish elimination logic already exists and should mostly stay intact.
- `expectedAnswer` is still needed for server-side comparison, but it must not be passed to real agents.
- Frontend model options currently include `gpt-4.1-mini`, `gpt-4.1`, `gpt-4.1-nano`, and `o4-mini`.
- Backend validation currently accepts any non-empty model string up to 80 characters.

## Important Design Point

Real model calls alone are not enough for this game.

The challenges are programming and computation tasks. If agents cannot execute code, many answers will be guesses rather than computed results. The real runner should therefore use the Vercel AI SDK with an `executeCode` tool.

The execution environment should be outsourced to Vercel Sandbox instead of a local Deno sandbox. The AI SDK will orchestrate the tool call, and `@vercel/sandbox` will provide the isolated ephemeral microVM where generated code runs.

For the MVP, use Python 3.13 execution in Vercel Sandbox. Python is sufficient for the arithmetic, hashing, modular arithmetic, encoding, and string-processing challenges listed in the backend plan, and it keeps the tool surface smaller than supporting multiple runtimes immediately.

## Implementation Steps

### 1. Add Backend AI Dependencies

Add these dependencies to `backend/package.json`:

```json
{
  "dependencies": {
    "ai": "latest",
    "@ai-sdk/openai": "latest",
    "@vercel/sandbox": "latest",
    "zod": "latest"
  }
}
```

Keep direct OpenAI provider usage first:

```ts
import { generateText, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { Sandbox } from "@vercel/sandbox";
```

This keeps direct OpenAI provider usage for model calls and uses Vercel Sandbox only for code execution. Vercel AI Gateway can be added later if desired.

Vercel Sandbox authentication requirements:

- In local development, link the project and pull environment variables with `vercel link` and `vercel env pull` so the SDK can read a Vercel OIDC token.
- In production on Vercel, authentication should be automatic through Vercel OIDC.
- If the backend is hosted outside Vercel, use Vercel access-token authentication with the required team/project/token environment variables.

### 2. Add A Backend Model Registry

Create `backend/models.ts`.

The backend should accept only stable, allowlisted model IDs from game creation input.

```ts
import { openai } from "@ai-sdk/openai";

export const SUPPORTED_MODEL_IDS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4.1-nano",
  "o4-mini",
] as const;

export type SupportedModelId = (typeof SUPPORTED_MODEL_IDS)[number];

export function isSupportedModelId(model: string): model is SupportedModelId {
  return SUPPORTED_MODEL_IDS.includes(model as SupportedModelId);
}

export function getModel(model: SupportedModelId) {
  return openai(model);
}
```

If a model is removed or unavailable, game creation should fail instead of silently substituting a different model.

### 3. Validate Competitor Models

Update `backend/validation.ts` so `agents[index].model` must be in `SUPPORTED_MODEL_IDS`.

This closes the gap where clients can currently submit arbitrary provider or model strings.

The frontend model dropdown should stay in sync with the backend registry. A later cleanup can share this constant between frontend and backend, but backend validation is the important first step.

### 4. Add A Real Agent Runner

Create `backend/agent-runner.ts`.

The runner should replace the mock runner boundary with a similar interface:

```ts
import type { Agent, Challenge } from "./types";

export type AgentRunInput = {
  agent: Agent;
  challenge: Pick<Challenge, "prompt">;
  signal: AbortSignal;
};

export type AgentRunResult = {
  answer: string | null;
  elapsedMs: number;
  error: string | null;
};
```

The runner must not receive `expectedAnswer`.

Its job is to:

- call `generateText`,
- use the agent's configured model,
- use the agent's system prompt,
- pass the challenge prompt,
- allow code execution through a tool,
- return a final answer string,
- measure elapsed time,
- convert failures into `{ answer: null, error }`.

Example shape:

```ts
const result = await generateText({
  model: getModel(agent.model),
  system: agent.systemPrompt,
  prompt: [
    "Solve this challenge.",
    "Use the executeCode tool when computation is useful.",
    "The executeCode tool runs Python 3.13 code.",
    "When done, respond with only the final answer string.",
    "",
    challenge.prompt,
  ].join("\n"),
  temperature: 0.2,
  maxOutputTokens: 1500,
  abortSignal: signal,
  timeout: config.skirmishTimeoutMs,
  stopWhen: stepCountIs(5),
  tools: {
    executeCode: tool({
      description:
        "Execute Python 3.13 code in an isolated Vercel Sandbox and return stdout/stderr.",
      inputSchema: z.object({
        code: z.string().max(12_000),
      }),
      execute: async ({ code }) => executeCode({ code, signal }),
    }),
  },
});
```

Trim the final `result.text` before returning it.

### 5. Add Vercel Sandbox Code Execution

Create `backend/code-execution.ts`.

This module should expose the AI SDK tool or the lower-level `executeCode` function used by the tool.

Use Vercel Sandbox as the execution environment:

```ts
import { Sandbox } from "@vercel/sandbox";

export type ExecuteCodeInput = {
  code: string;
  signal: AbortSignal;
};

export type ExecuteCodeResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error: string | null;
};
```

Implementation shape:

```ts
export async function executeCode({
  code,
  signal,
}: ExecuteCodeInput): Promise<ExecuteCodeResult> {
  if (code.length > config.maxExecutorCodeChars) {
    return {
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      error: "Code exceeds maximum length.",
    };
  }

  const sandbox = await Sandbox.create({
    runtime: "python3.13",
    networkPolicy: "deny-all",
  });

  try {
    const result = await sandbox.runCommand("python3", ["-c", code], {
      timeout: config.executorTimeoutMs,
      signal,
    });

    return {
      stdout: truncate(await result.stdout(), config.maxExecutorOutputChars),
      stderr: truncate(await result.stderr(), config.maxExecutorOutputChars),
      exitCode: result.exitCode,
      timedOut: false,
      error: null,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: signal.aborted,
      error: error instanceof Error ? error.message : "Code execution failed.",
    };
  } finally {
    await sandbox.stop().catch(() => {});
  }
}
```

The exact `runCommand` options should be verified against the installed `@vercel/sandbox` version while implementing. If its timeout or abort API differs, wrap the command in our own timeout and stop the sandbox on abort.

Execution requirements:

- run generated code in Vercel Sandbox, not on the backend host,
- use the `python3.13` runtime for MVP,
- create an ephemeral sandbox for each tool execution,
- set `networkPolicy: "deny-all"`,
- enforce a maximum code size before sandbox creation,
- enforce a wall-clock timeout,
- propagate aborts from the skirmish `AbortSignal` where the SDK supports it,
- truncate stdout and stderr,
- return structured errors instead of throwing for normal execution failures,
- always stop the sandbox in `finally`.

Suggested defaults:

```txt
EXECUTOR_TIMEOUT_MS=5000
MAX_EXECUTOR_CODE_CHARS=12000
MAX_EXECUTOR_OUTPUT_CHARS=8000
```

Optional shortcut:

- Evaluate `ai-sdk-tool-code-execution`, a Vercel Labs package that exposes an AI SDK `executeCode` tool backed by Vercel Sandbox.
- It is Python-only, which matches the MVP direction.
- If the package is stable enough for our usage, it can replace most of `backend/code-execution.ts`.
- If it lacks timeout, output, or error-shaping controls we need, implement the thin wrapper ourselves with `@vercel/sandbox`.

### 6. Add Timeout And Runner Configuration

Move hardcoded skirmish timeout configuration out of `backend/game-store.ts`.

Current code uses:

```ts
const SKIRMISH_TIMEOUT_MS = 10_000;
```

The backend plan expects a real 60-second limit:

```txt
SKIRMISH_TIMEOUT_MS=60000
```

Use a config default of 60 seconds, while allowing shorter local demo values through environment variables.

### 7. Wire The Real Runner Into Skirmishes

Update `backend/game-store.ts`.

Replace:

```ts
import { runMockAgent } from "./mock-agent";
```

with:

```ts
import { runAgent } from "./agent-runner";
```

When calling the runner, pass only:

```ts
challenge: {
  prompt: skirmish.challenge.prompt,
}
```

Do not pass `expectedAnswer`.

Then compare the returned answer to the expected answer in `game-store.ts`:

```ts
correct:
  normalizeAnswer(result.answer) ===
  normalizeAnswer(skirmish.challenge.expectedAnswer)
```

Add a small answer normalizer:

```ts
function normalizeAnswer(answer: string | null): string {
  return answer?.trim() ?? "";
}
```

A later improvement can strip wrapping quotes or code fences, but plain trimming is the safest first step.

### 8. Preserve Existing Elimination Rules

Keep the existing resolution behavior:

- incorrect answer eliminates the agent,
- timeout or runner error eliminates the agent,
- if everyone is correct, eliminate the slowest correct agent,
- if every selected agent would be eliminated, cancel the skirmish and restore all participants,
- otherwise eliminate marked agents and restore survivors,
- finish the game when one active agent remains.

The main change is the source of `answer`, not the elimination state machine.

### 9. Add Tests With Runner Injection

Do not make normal tests depend on live OpenAI calls.

Refactor enough of `game-store.ts` to inject or override the runner in tests.

Test cases:

- correct answer keeps agent alive unless all selected agents are correct and it is slowest,
- incorrect answer eliminates agent,
- timeout/error eliminates agent,
- all selected agents failing cancels the skirmish and restores them,
- all selected agents correct eliminates the slowest agent,
- winner is declared when one agent remains,
- public active skirmish state does not expose `expectedAnswer`,
- game creation rejects unsupported model IDs,
- `executeCode` returns stdout for simple Python arithmetic,
- `executeCode` truncates excessive output,
- `executeCode` returns a structured error for invalid Python,
- `executeCode` stops the sandbox on timeout or abort.

Sandbox-backed tests may need a separate integration-test mode because they require Vercel Sandbox credentials. Normal unit tests should mock `executeCode`.

### 10. Manual End-To-End Smoke Test

With `OPENAI_API_KEY` and Vercel Sandbox auth configured:

1. Start backend and frontend.
2. Create a game with 2-4 agents using supported OpenAI model IDs.
3. Submit an easy deterministic challenge, such as:

   ```txt
   What is 123456789 * 987654321?
   ```

   Expected answer:

   ```txt
   121932631112635269
   ```

4. Verify a skirmish starts.
5. Verify agents call the model and use the Python `executeCode` tool when useful.
6. Verify the expected elimination rule is applied.
7. Submit repeated challenges until a winner is declared.

## Recommended Order Of Work

1. Add dependencies and model registry.
2. Add backend model validation.
3. Add `agent-runner.ts` using `generateText` without tools first.
4. Wire the real runner into skirmishes and verify simple arithmetic prompts.
5. Add `backend/code-execution.ts` using Vercel Sandbox.
6. Add the Vercel Sandbox-backed `executeCode` tool to the runner.
7. Add focused tests around runner injection and elimination logic.
8. Run one real end-to-end game with `OPENAI_API_KEY` and Vercel Sandbox auth.

## Follow-Up Improvements

- Share model options between backend and frontend.
- Add competitor-level `temperature` and `maxOutputTokens` fields to the current app types.
- Add status-level runtime events for `competitor:started`, `competitor:tool_call`, and `competitor:answered`.
- Add WebSocket updates if live polling becomes insufficient.
- Consider Vercel AI Gateway after direct OpenAI integration is stable.
- Consider reusing sandboxes or snapshots only if per-tool sandbox startup is too slow.
- Consider adding a Node runtime later if Python is not enough for challenge coverage.
- Improve answer normalization for common model formatting issues.
- Add admin-visible runner diagnostics without exposing prompts, API keys, or `expectedAnswer` to spectators.
