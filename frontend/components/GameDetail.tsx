"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
  Swords,
  Trash2,
  Trophy,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { LogBackendStateButton } from "@/components/LogBackendStateButton";
import { Button } from "@/components/ui/button";
import {
  ApiClientError,
  deleteQueuedChallenge,
  fetchGameState,
  submitChallenge,
} from "@/lib/api";
import type {
  Agent,
  GameState,
  SkirmishAgentResult,
  SkirmishPublic,
} from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: Agent["status"]) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "competing") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "eliminated") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

function getAgentName(agents: Agent[], agentId: string) {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function resultStatusLabel(result: SkirmishAgentResult) {
  if (result.error) {
    return result.error;
  }

  const answerStatus = result.correct ? "correct" : "incorrect";
  return result.eliminated ? `${answerStatus} · eliminated` : answerStatus;
}

function ChallengeSubmitter({ submittedBy }: { submittedBy: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <UserRound className="size-3.5" aria-hidden="true" />
      Submitted by {submittedBy}
    </span>
  );
}

function AnswerValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium uppercase tracking-normal text-zinc-500">
        {label}
      </p>
      <p className="min-h-8 whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-white px-2 py-1.5 font-mono text-xs leading-5 text-zinc-800">
        {value ?? "No answer"}
      </p>
    </div>
  );
}

function SkirmishPanel({
  skirmish,
  agents,
}: {
  skirmish: SkirmishPublic;
  agents: Agent[];
}) {
  return (
    <article className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Swords className="size-5 text-amber-700" aria-hidden="true" />
          <h2 className="font-semibold text-amber-950">Active skirmish</h2>
        </div>
        <span className="text-xs font-medium uppercase tracking-normal text-amber-800">
          {skirmish.status}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-950">
        {skirmish.challenge.prompt}
      </p>
      <div className="mt-2">
        <ChallengeSubmitter submittedBy={skirmish.challenge.submittedBy} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {skirmish.agentIds.map((agentId) => (
          <span
            key={agentId}
            className="inline-flex h-7 items-center rounded-full border border-amber-300 bg-white px-2 text-xs font-medium text-amber-900"
          >
            {getAgentName(agents, agentId)}
          </span>
        ))}
      </div>
    </article>
  );
}

export function GameDetail({ gameId }: { gameId: string }) {
  const { token, user, isAdmin, logout, openSignIn } = useAuth();
  const [state, setState] = useState<GameState | null>(null);
  const [prompt, setPrompt] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingChallengeId, setDeletingChallengeId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      try {
        setState(await fetchGameState(gameId));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load game.",
        );
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [gameId],
  );

  useEffect(() => {
    let isActive = true;

    async function loadInitialGame() {
      await Promise.resolve();
      if (isActive) {
        await loadState();
      }
    }

    void loadInitialGame();

    return () => {
      isActive = false;
    };
  }, [loadState]);

  useEffect(() => {
    if (!state || (state.game.status === "finished" && !state.activeSkirmish)) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadState(false);
    }, 1500);

    return () => window.clearInterval(interval);
  }, [loadState, state]);

  const activeAgentCount = useMemo(
    () =>
      state?.agents.filter((agent) => agent.status !== "eliminated").length ??
      0,
    [state],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      openSignIn("spectator");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitChallenge(token, gameId, {
        prompt,
        expectedAnswer,
      });
      setState(result.state);
      setPrompt("");
      setExpectedAnswer("");
    } catch (submitError) {
      if (
        submitError instanceof ApiClientError &&
        submitError.code === "UNAUTHORIZED"
      ) {
        logout();
        setError("Your session expired. Sign in again to submit challenges.");
      } else {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to submit challenge.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteChallenge(challengeId: string) {
    if (!token || !isAdmin) {
      openSignIn("admin");
      return;
    }

    setDeletingChallengeId(challengeId);
    setError(null);

    try {
      setState(await deleteQueuedChallenge(token, gameId, challengeId));
    } catch (deleteError) {
      if (
        deleteError instanceof ApiClientError &&
        deleteError.code === "UNAUTHORIZED"
      ) {
        logout();
        setError("Your session expired. Sign in again to delete challenges.");
      } else {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Unable to delete challenge.",
        );
      }
    } finally {
      setDeletingChallengeId(null);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
          <Link
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
            href="/"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Lobby
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadState()}
              disabled={isLoading}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
            <LogBackendStateButton
              onError={(logError) => {
                setError(
                  logError instanceof Error
                    ? logError.message
                    : "Unable to log backend state.",
                );
              }}
            />
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {isLoading ? (
          <section className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-600">
            Loading game...
          </section>
        ) : state ? (
          <>
            <header className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-zinc-950">
                  {state.game.name}
                </h1>
                <span className="inline-flex h-6 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-800">
                  {state.game.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600">
                <span className="inline-flex items-center gap-1.5">
                  <Bot className="size-4" aria-hidden="true" />
                  {activeAgentCount}/{state.agents.length} active
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-4" aria-hidden="true" />
                  Created {formatDate(state.game.createdAt)}
                </span>
              </div>
            </header>

            {state.winner ? (
              <section className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                <Trophy className="size-5 shrink-0" aria-hidden="true" />
                <p className="font-medium">{state.winner.name} wins</p>
              </section>
            ) : null}

            <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <form
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <div className="flex items-center gap-2">
                  <Send className="size-5 text-emerald-700" aria-hidden="true" />
                  <h2 className="font-semibold text-zinc-950">
                    Submit challenge
                  </h2>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                    Prompt
                    <textarea
                      className="min-h-28 resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-zinc-100"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      maxLength={2000}
                      disabled={isSubmitting || state.game.status === "finished"}
                      required
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                    Expected answer
                    <input
                      className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-zinc-100"
                      value={expectedAnswer}
                      onChange={(event) => setExpectedAnswer(event.target.value)}
                      maxLength={500}
                      disabled={isSubmitting || state.game.status === "finished"}
                      required
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || state.game.status === "finished"}
                  >
                    <Send aria-hidden="true" />
                    Submit
                  </Button>
                  {!user ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openSignIn("spectator")}
                    >
                      Sign in
                    </Button>
                  ) : (
                    <span className="text-sm text-zinc-600">
                      Signed in as {user.username}
                    </span>
                  )}
                </div>
              </form>

              <div className="grid content-start gap-4">
                {state.activeSkirmish ? (
                  <SkirmishPanel
                    skirmish={state.activeSkirmish}
                    agents={state.agents}
                  />
                ) : (
                  <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
                    No skirmish is running.
                  </section>
                )}

                <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h2 className="font-semibold text-zinc-950">
                      Pending challenges
                    </h2>
                  </div>
                  {state.pendingChallenges.length > 0 ? (
                    <div className="divide-y divide-zinc-200">
                      {state.pendingChallenges.map((challenge) => (
                        <div
                          key={challenge.id}
                          className="flex items-start gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm text-zinc-800">
                              {challenge.prompt}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {challenge.status}
                            </p>
                            <div className="mt-1">
                              <ChallengeSubmitter
                                submittedBy={challenge.submittedBy}
                              />
                            </div>
                          </div>
                          {isAdmin ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon-sm"
                              aria-label="Delete queued challenge"
                              title="Delete queued challenge"
                              disabled={deletingChallengeId === challenge.id}
                              onClick={() =>
                                void handleDeleteChallenge(challenge.id)
                              }
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-5 text-sm text-zinc-600">
                      No queued challenges.
                    </p>
                  )}
                </section>
              </div>
            </section>

            <section className="grid gap-3">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-emerald-700" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-zinc-950">
                  Agent roster
                </h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {state.agents.map((agent) => (
                  <article
                    key={agent.id}
                    className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-zinc-950">
                          {agent.name}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          {agent.description || "No public description."}
                        </p>
                      </div>
                      <span
                        className={`inline-flex h-6 w-fit items-center rounded-full border px-2 text-xs font-medium ${statusClass(agent.status)}`}
                      >
                        {agent.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex h-6 w-fit items-center rounded-full border border-sky-200 bg-sky-50 px-2 font-mono text-xs text-sky-800">
                        {agent.model}
                      </span>
                      {agent.eliminatedAt ? (
                        <span className="inline-flex h-6 w-fit items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-xs text-zinc-600">
                          Out {formatDate(agent.eliminatedAt)}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h2 className="font-semibold text-zinc-950">
                  Skirmish history
                </h2>
              </div>
              {state.skirmishHistory.length > 0 ? (
                <div className="divide-y divide-zinc-200">
                  {state.skirmishHistory
                    .slice()
                    .reverse()
                    .map((skirmish) => (
                      <article key={skirmish.id} className="px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-950">
                              {skirmish.challenge.prompt}
                            </p>
                            <div className="mt-1">
                              <ChallengeSubmitter
                                submittedBy={skirmish.challenge.submittedBy}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-medium uppercase tracking-normal text-zinc-500">
                            {skirmish.status}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {skirmish.results.map((result) => (
                            <div
                              key={result.agentId}
                              className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                            >
                              <div className="flex items-center gap-2">
                                {result.correct && !result.error && !result.eliminated ? (
                                  <CheckCircle2
                                    className="size-4 text-emerald-700"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <XCircle
                                    className="size-4 text-red-700"
                                    aria-hidden="true"
                                  />
                                )}
                                <p className="truncate text-sm font-medium text-zinc-950">
                                  {getAgentName(state.agents, result.agentId)}
                                </p>
                              </div>
                              <p className="mt-1 text-xs text-zinc-600">
                                {result.elapsedMs ?? 0}ms · {resultStatusLabel(result)}
                              </p>
                              <AnswerValue
                                label="Model answer"
                                value={result.answer}
                              />
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <p className="px-4 py-5 text-sm text-zinc-600">
                  No completed skirmishes yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
