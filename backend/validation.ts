import { HttpError } from "./http";
import { isSupportedModelId, SUPPORTED_MODEL_IDS } from "./models";
import type { ChallengeInput, GameInput } from "./types";

const NAME_MAX_LENGTH = 80;
const AGENT_NAME_MAX_LENGTH = 60;
const MODEL_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 240;
const SYSTEM_PROMPT_MAX_LENGTH = 4000;
const USERNAME_MAX_LENGTH = 32;
const CHALLENGE_PROMPT_MAX_LENGTH = 2000;
const EXPECTED_ANSWER_MAX_LENGTH = 500;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "BAD_REQUEST", `${field} is required.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, "BAD_REQUEST", `${field} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      `${field} must be ${maxLength} characters or fewer.`,
    );
  }

  return trimmed;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, "BAD_REQUEST", `${field} must be a string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      `${field} must be ${maxLength} characters or fewer.`,
    );
  }

  return trimmed;
}

export function validateGameInput(value: unknown): GameInput {
  if (!isRecord(value)) {
    throw new HttpError(400, "BAD_REQUEST", "Request body must be an object.");
  }

  if (!Array.isArray(value.agents)) {
    throw new HttpError(400, "BAD_REQUEST", "agents must be an array.");
  }

  if (value.agents.length < 2) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "A game must have at least two agents.",
    );
  }

  return {
    name: requireString(value.name, "name", NAME_MAX_LENGTH),
    agents: value.agents.map((agent, index) => {
      if (!isRecord(agent)) {
        throw new HttpError(
          400,
          "BAD_REQUEST",
          `agents[${index}] must be an object.`,
        );
      }

      const id = optionalString(agent.id, `agents[${index}].id`, 120);
      const description = optionalString(
        agent.description,
        `agents[${index}].description`,
        DESCRIPTION_MAX_LENGTH,
      );

      const model = requireString(
        agent.model,
        `agents[${index}].model`,
        MODEL_MAX_LENGTH,
      );

      if (!isSupportedModelId(model)) {
        throw new HttpError(
          400,
          "BAD_REQUEST",
          `agents[${index}].model must be one of: ${SUPPORTED_MODEL_IDS.join(
            ", ",
          )}.`,
        );
      }

      return {
        ...(id ? { id } : {}),
        name: requireString(
          agent.name,
          `agents[${index}].name`,
          AGENT_NAME_MAX_LENGTH,
        ),
        model,
        ...(description !== undefined ? { description } : {}),
        systemPrompt: requireString(
          agent.systemPrompt,
          `agents[${index}].systemPrompt`,
          SYSTEM_PROMPT_MAX_LENGTH,
        ),
      };
    }),
  };
}

export function validateLoginInput(value: unknown): {
  username: string;
  password: string;
} {
  if (!isRecord(value) || typeof value.password !== "string") {
    throw new HttpError(400, "BAD_REQUEST", "password is required.");
  }

  return {
    username: validateUsername(value.username),
    password: value.password,
  };
}

export function validateUsername(value: unknown): string {
  const username = requireString(value, "username", USERNAME_MAX_LENGTH);

  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "username may only contain letters, numbers, underscores, and hyphens.",
    );
  }

  return username;
}

export function validateSpectatorLoginInput(value: unknown): {
  username: string;
} {
  if (!isRecord(value)) {
    throw new HttpError(400, "BAD_REQUEST", "Request body must be an object.");
  }

  return { username: validateUsername(value.username) };
}

export function validateChallengeInput(value: unknown): ChallengeInput {
  if (!isRecord(value)) {
    throw new HttpError(400, "BAD_REQUEST", "Request body must be an object.");
  }

  return {
    prompt: requireString(
      value.prompt,
      "prompt",
      CHALLENGE_PROMPT_MAX_LENGTH,
    ),
    expectedAnswer: requireString(
      value.expectedAnswer,
      "expectedAnswer",
      EXPECTED_ANSWER_MAX_LENGTH,
    ),
  };
}
