import { ArrowRight, Bot, Clock3, Swords, Trash2, Trophy } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { GameState } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type GameCardProps = {
  state: GameState;
  isAdmin?: boolean;
  isBusy?: boolean;
  onDelete?: (gameId: string) => void;
};

export function GameCard({
  state,
  isAdmin = false,
  isBusy = false,
  onDelete,
}: GameCardProps) {
  const { game } = state;
  const activeAgentCount = state.agents.filter(
    (agent) => agent.status === "active" || agent.status === "competing",
  ).length;

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-zinc-950">
              {game.name}
            </h2>
            <span className="inline-flex h-6 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-800">
              {game.status}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <Bot className="size-4" aria-hidden="true" />
              {activeAgentCount}/{state.agents.length} active
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swords className="size-4" aria-hidden="true" />
              {state.activeSkirmish
                ? "Skirmish running"
                : `${state.pendingChallenges.length} queued`}
            </span>
            {state.winner ? (
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="size-4" aria-hidden="true" />
                Winner: {state.winner.name}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" aria-hidden="true" />
              Created {formatDate(game.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
            href={`/games/${game.id}`}
          >
            View
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          {isAdmin && onDelete ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              title="Delete game"
              onClick={() => onDelete(game.id)}
              disabled={isBusy}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
