"use client";

import {
  AlertCircle,
  Eye,
  LogOut,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GameForm } from "@/components/GameForm";
import { LogBackendStateButton } from "@/components/LogBackendStateButton";
import { Button } from "@/components/ui/button";
import {
  ApiClientError,
  SESSION_TOKEN_STORAGE_KEY,
  createGame,
  deleteGame,
  fetchGames,
} from "@/lib/api";
import type { GameInput, GameState } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminDashboard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [games, setGames] = useState<GameState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    router.replace("/");
  }, [router]);

  const handleApiError = useCallback(
    (apiError: unknown) => {
      if (
        apiError instanceof ApiClientError &&
        apiError.code === "UNAUTHORIZED"
      ) {
        logout();
        return;
      }

      setError(
        apiError instanceof Error
          ? apiError.message
          : "The admin request failed.",
      );
    },
    [logout],
  );

  const loadGames = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setGames(await fetchGames());
    } catch (loadError) {
      handleApiError(loadError);
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    let isActive = true;

    async function readAdminToken() {
      await Promise.resolve();
      if (!isActive) {
        return;
      }

      const storedToken = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (!storedToken) {
        router.replace("/admin/login");
        return;
      }

      setToken(storedToken);
      setIsCheckingAuth(false);
    }

    void readAdminToken();

    return () => {
      isActive = false;
    };
  }, [router]);

  useEffect(() => {
    let isActive = true;

    async function loadInitialGames() {
      await Promise.resolve();
      if (isActive && token) {
        await loadGames();
      }
    }

    void loadInitialGames();

    return () => {
      isActive = false;
    };
  }, [loadGames, token]);

  async function handleSubmit(input: GameInput) {
    if (!token) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await createGame(token, input);
      await loadGames();
    } catch (submitError) {
      handleApiError(submitError);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(gameId: string) {
    if (!token || !window.confirm("Delete this game?")) {
      return;
    }

    setBusyGameId(gameId);
    setError(null);

    try {
      await deleteGame(token, gameId);
      await loadGames();
    } catch (deleteError) {
      handleApiError(deleteError);
    } finally {
      setBusyGameId(null);
    }
  }

  if (isCheckingAuth) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-sm text-zinc-600">
        Checking admin session...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Admin dashboard
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-950">
              Game management
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Create active games and permanently delete games that are no
              longer needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadGames()}
              disabled={isLoading}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
            <LogBackendStateButton onError={handleApiError} />
            <Button type="button" variant="outline" onClick={logout}>
              <LogOut aria-hidden="true" />
              Logout
            </Button>
          </div>
        </header>

        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
          <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-base font-semibold text-zinc-950">Games</h2>
            </div>

            {isLoading ? (
              <div className="px-4 py-8 text-sm text-zinc-600">
                Loading games...
              </div>
            ) : games.length > 0 ? (
              <div className="divide-y divide-zinc-200">
                {games.map((state) => (
                  <article
                    key={state.game.id}
                    className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-zinc-950">
                          {state.game.name}
                        </h3>
                        <span className="inline-flex h-5 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 text-xs font-medium text-emerald-800">
                          {state.game.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-600">
                        {
                          state.agents.filter(
                            (agent) => agent.status !== "eliminated",
                          ).length
                        }
                        /{state.agents.length} active ·{" "}
                        {state.pendingChallenges.length} queued · Created{" "}
                        {formatDate(state.game.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        className="inline-flex size-7 items-center justify-center rounded-lg text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950"
                        href={`/games/${state.game.id}`}
                        title="View public page"
                      >
                        <Eye aria-hidden="true" />
                      </Link>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        title="Delete game"
                        onClick={() => void handleDelete(state.game.id)}
                        disabled={busyGameId === state.game.id}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-sm text-zinc-600">
                No games yet. Create the first active game from the editor.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 border-b border-zinc-200 pb-3">
              <h2 className="text-base font-semibold text-zinc-950">
                Create game
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Game configuration is locked after creation and visible to
                spectators in this MVP.
              </p>
            </div>
            <GameForm isSaving={isSaving} onSubmit={handleSubmit} />
          </section>
        </div>
      </div>
    </main>
  );
}
