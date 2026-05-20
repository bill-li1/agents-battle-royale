"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GameInput } from "@/lib/types";

const MODEL_OPTIONS = [
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    description: "Balanced speed and reasoning",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    description: "Strongest reasoning",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    description: "Strong, more affordable",
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    description: "Fastest and cheapest",
  },
] as const;

const DEFAULT_PROMPT =
  "You are a coding agent in a programming challenge. Solve the task carefully and return only the final answer.";

type AgentDraft = Omit<GameInput["agents"][number], "id"> & {
  id: string;
};

type FormState = {
  name: string;
  agents: AgentDraft[];
};

function makeAgentId() {
  return globalThis.crypto?.randomUUID?.() ?? String(Math.random());
}

function makeAgent(index: number): AgentDraft {
  const defaults = [
    {
      name: "Cipher",
      description: "Careful arithmetic and checksum specialist.",
    },
    {
      name: "Forge",
      description: "Fast scripting approach with concise answers.",
    },
  ];
  const preset = defaults[index] ?? {
    name: `Agent ${index + 1}`,
    description: "General-purpose coding competitor.",
  };

  return {
    id: makeAgentId(),
    name: preset.name,
    model: MODEL_OPTIONS[0].id,
    description: preset.description,
    systemPrompt: DEFAULT_PROMPT,
  };
}

function createInitialState(): FormState {
  return {
    name: "New battle",
    agents: [makeAgent(0), makeAgent(1)],
  };
}

const MIN_AGENTS = 2;

const REMOVE_AGENT_DISABLED_TOOLTIP =
  "Each game needs at least two agents.";

function RemoveAgentButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Remove agent"
      onClick={onClick}
      disabled={disabled}
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );

  if (!disabled) {
    return button;
  }

  return (
    <span className="group/remove relative inline-flex">
      {button}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-48 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-center text-xs leading-5 text-white opacity-0 shadow-sm transition-opacity group-hover/remove:opacity-100"
      >
        {REMOVE_AGENT_DISABLED_TOOLTIP}
      </span>
    </span>
  );
}

export function GameForm({
  isSaving,
  onSubmit,
  stickyFooter = false,
}: {
  isSaving?: boolean;
  onSubmit: (input: GameInput) => Promise<void> | void;
  stickyFooter?: boolean;
}) {
  const [form, setForm] = useState<FormState>(createInitialState);

  function updateAgent(
    agentId: string,
    patch: Partial<Omit<AgentDraft, "id">>,
  ) {
    setForm((current) => ({
      ...current,
      agents: current.agents.map((agent) =>
        agent.id === agentId ? { ...agent, ...patch } : agent,
      ),
    }));
  }

  function removeAgent(agentId: string) {
    setForm((current) => ({
      ...current,
      agents: current.agents.filter((agent) => agent.id !== agentId),
    }));
  }

  function addAgent() {
    setForm((current) => ({
      ...current,
      agents: [...current.agents, makeAgent(current.agents.length)],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.agents.length < MIN_AGENTS) {
      return;
    }

    await onSubmit({
      name: form.name,
      agents: form.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        model: agent.model,
        ...(agent.description !== undefined
          ? { description: agent.description }
          : {}),
        systemPrompt: agent.systemPrompt,
      })),
    });
    setForm(createInitialState());
  }

  const formFields = (
    <>
      <div className="grid min-w-0 gap-1.5">
        <label className="text-sm font-medium text-zinc-800" htmlFor="gameName">
          Game name
        </label>
        <input
          id="gameName"
          className="h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
          maxLength={80}
          required
        />
      </div>

      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-950">Agents</h3>
          <Button
            type="button"
            variant={stickyFooter ? "default" : "outline"}
            onClick={addAgent}
          >
            <Plus aria-hidden="true" />
            Add agent
          </Button>
        </div>

        {form.agents.length > 0 ? (
          form.agents.map((agent) => (
            <section
              key={agent.id}
              className="grid min-w-0 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className="truncate font-mono text-xs font-medium text-zinc-700"
                  title={agent.id}
                >
                  {agent.id}
                </p>
                <RemoveAgentButton
                  disabled={form.agents.length <= MIN_AGENTS}
                  onClick={() => removeAgent(agent.id)}
                />
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1.5 text-sm font-medium text-zinc-800">
                  Name
                  <input
                    className="h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                    value={agent.name}
                    onChange={(event) =>
                      updateAgent(agent.id, { name: event.target.value })
                    }
                    maxLength={60}
                    required
                  />
                </label>

                <label className="grid min-w-0 gap-1.5 text-sm font-medium text-zinc-800">
                  Model
                  <select
                    className="h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                    value={agent.model}
                    onChange={(event) =>
                      updateAgent(agent.id, {
                        model: event.target.value,
                      })
                    }
                    required
                  >
                    {MODEL_OPTIONS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label} - {model.description}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid min-w-0 gap-1.5 text-sm font-medium text-zinc-800">
                Description
                <input
                  className="h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                  value={agent.description ?? ""}
                  onChange={(event) =>
                    updateAgent(agent.id, {
                      description: event.target.value,
                    })
                  }
                  maxLength={240}
                />
              </label>

              <label className="grid min-w-0 gap-1.5 text-sm font-medium text-zinc-800">
                System prompt
                <textarea
                  className="min-h-28 w-full min-w-0 resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                  value={agent.systemPrompt}
                  onChange={(event) =>
                    updateAgent(agent.id, {
                      systemPrompt: event.target.value,
                    })
                  }
                  maxLength={4000}
                  required
                />
              </label>
            </section>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-sm text-zinc-600">
            No agents configured.
          </div>
        )}
      </div>
    </>
  );

  const submitFooter = (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-white",
        stickyFooter ? "px-5 py-4" : "pt-4",
      )}
    >
      <Button type="submit" disabled={isSaving || form.agents.length < MIN_AGENTS}>
        <Save aria-hidden="true" />
        {isSaving ? "Creating..." : "Create game"}
      </Button>
    </div>
  );

  if (stickyFooter) {
    return (
      <form
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        onSubmit={handleSubmit}
      >
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4">
          <div className="grid min-w-0 gap-5">{formFields}</div>
        </div>
        {submitFooter}
      </form>
    );
  }

  return (
    <form className="grid min-w-0 gap-5" onSubmit={handleSubmit}>
      {formFields}
      {submitFooter}
    </form>
  );
}
