import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { config } from "./config";
import { executeCode } from "./code-execution";
import { getModel, isSupportedModelId } from "./models";
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

export type AgentRunner = (input: AgentRunInput) => Promise<AgentRunResult>;

export const runAgent: AgentRunner = async ({
  agent,
  challenge,
  signal,
}) => {
  const startedAt = performance.now();

  try {
    if (!isSupportedModelId(agent.model)) {
      throw new Error(`Unsupported model: ${agent.model}`);
    }

    const result = await generateText({
      model: getModel(agent.model),
      system: agent.systemPrompt,
      prompt: [
        "Solve this challenge.",
        "Use the executeCode tool when computation is useful.",
        "The executeCode tool runs Python 3.13 code in an isolated sandbox.",
        "When done, respond with only the final answer string.",
        "",
        challenge.prompt,
      ].join("\n"),
      temperature: 0.2,
      maxOutputTokens: 1500,
      abortSignal: signal,
      timeout: { totalMs: config.skirmishTimeoutMs },
      providerOptions: {
        openai: {
          store: false,
        },
      },
      stopWhen: stepCountIs(5),
      tools: {
        executeCode: tool({
          description:
            "Execute Python 3.13 code in an isolated Vercel Sandbox and return stdout, stderr, exitCode, timedOut, and error.",
          inputSchema: z.object({
            code: z.string().max(config.maxExecutorCodeChars),
          }),
          execute: async ({ code }) => executeCode({ code, signal }),
        }),
      },
    });

    return {
      answer: result.text.trim(),
      elapsedMs: Math.round(performance.now() - startedAt),
      error: null,
    };
  } catch (error) {
    return {
      answer: null,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Agent run failed.",
    };
  }
};
