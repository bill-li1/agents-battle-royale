import { openai } from "@ai-sdk/openai";

export const SUPPORTED_MODEL_IDS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
] as const;

export type SupportedModelId = (typeof SUPPORTED_MODEL_IDS)[number];

export function isSupportedModelId(model: string): model is SupportedModelId {
  return SUPPORTED_MODEL_IDS.includes(model as SupportedModelId);
}

export function getModel(model: SupportedModelId) {
  return openai.chat(model);
}
