"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { GameForm } from "@/components/GameForm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GameInput } from "@/lib/types";

export function CreateGameModal({
  open,
  onOpenChange,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving?: boolean;
  onSubmit: (input: GameInput) => Promise<void> | void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4 sm:p-6">
          <Dialog.Popup
            className={cn(
              "relative flex max-h-[min(90vh,52rem)] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl",
              "transition-all data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            )}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div className="grid gap-1 pr-2">
                <Dialog.Title className="text-base font-semibold text-zinc-950">
                  Create game
                </Dialog.Title>
                <Dialog.Description className="text-sm text-zinc-600">
                  Game configuration is locked after creation.
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close"
                  />
                }
              >
                <X aria-hidden="true" />
              </Dialog.Close>
            </header>
            <GameForm
              stickyFooter
              isSaving={isSaving}
              onSubmit={onSubmit}
            />
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
