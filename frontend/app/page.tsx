"use client";

import {
  AlertCircle,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { CreateGameModal } from "@/components/CreateGameModal";
import { GameCard } from "@/components/GameCard";
import { LogBackendStateButton } from "@/components/LogBackendStateButton";
import { Button } from "@/components/ui/button";
import {
  ApiClientError,
  createGame,
  deleteGame,
  fetchGames,
} from "@/lib/api";
import type { GameInput, GameState } from "@/lib/types";

export default function Home() {
  const { token, user, isAdmin, isCheckingSession, logout, openSignIn } =
    useAuth();
  const [games, setGames] = useState<GameState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApiError = useCallback(
    (apiError: unknown) => {
      if (
        apiError instanceof ApiClientError &&
        apiError.code === "UNAUTHORIZED"
      ) {
        logout();
        setError("Your session expired. Sign in again to continue.");
        return;
      }

      setError(
        apiError instanceof Error
          ? apiError.message
          : "The request failed.",
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

    async function loadInitialGames() {
      await Promise.resolve();
      if (isActive) {
        await loadGames();
      }
    }

    void loadInitialGames();

    return () => {
      isActive = false;
    };
  }, [loadGames]);

  async function handleSubmit(input: GameInput) {
    if (!token || !isAdmin) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await createGame(token, input);
      await loadGames();
      setIsCreateModalOpen(false);
    } catch (submitError) {
      handleApiError(submitError);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(gameId: string) {
    if (!token || !isAdmin || !window.confirm("Delete this game?")) {
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

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-zinc-200 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-x-6">
          <div className="min-w-0">
            {user ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                <span>
                  Signed in as{" "}
                  <span className="font-semibold text-zinc-950">
                    {user.username}
                  </span>
                </span>
                <span
                  className={
                    isAdmin
                      ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
                      : "inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
                  }
                >
                  {isAdmin ? "Admin" : "Spectator"}
                </span>
              </p>
            ) : null}
            <h1
              className={`text-3xl font-semibold tracking-normal text-balance text-zinc-950 ${user ? "mt-1" : ""}`}
            >
              AI Coding Agent Battle Royale
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Browse active games, inspect the participating coding agents, and
              manage games when signed in as an admin.
            </p>
          </div>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadGames()}
              disabled={isLoading}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
            <LogBackendStateButton
              onError={(logError) => {
                handleApiError(logError);
              }}
            />
            {isAdmin ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus aria-hidden="true" />
                Create game
              </Button>
            ) : null}
            {!isCheckingSession && !isAdmin ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => openSignIn("admin")}
              >
                <ShieldCheck aria-hidden="true" />
                Admin login
              </Button>
            ) : null}
            {user ? (
              <Button type="button" variant="outline" onClick={logout}>
                <LogOut aria-hidden="true" />
                Logout
              </Button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-3">
          <section className="grid content-start gap-3">
            {isLoading ? (
              <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-600">
                Loading games...
              </div>
            ) : games.length > 0 ? (
              games.map((game) => (
                <GameCard
                  key={game.game.id}
                  state={game}
                  isAdmin={isAdmin}
                  isBusy={busyGameId === game.game.id}
                  onDelete={(gameId) => void handleDelete(gameId)}
                />
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-10">
                <p className="text-sm font-medium text-zinc-950">
                  No games have been created yet.
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {isAdmin
                    ? "Create the first game using the Create game button above."
                    : "An admin can create the first game after logging in."}
                </p>
              </div>
            )}
          </section>
        </div>

        {isAdmin ? (
          <CreateGameModal
            open={isCreateModalOpen}
            onOpenChange={setIsCreateModalOpen}
            isSaving={isSaving}
            onSubmit={handleSubmit}
          />
        ) : null}
      </div>
    </main>
  );
}
