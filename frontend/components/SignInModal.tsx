"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AlertCircle, LogIn, ShieldCheck, UserRound, X } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SignInMode = "spectator" | "admin";

export function SignInModal({
  open,
  canDismiss,
  mode,
  isSubmitting,
  error,
  onOpenChange,
  onModeChange,
  onSpectatorSubmit,
  onAdminSubmit,
}: {
  open: boolean;
  canDismiss?: boolean;
  mode: SignInMode;
  isSubmitting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: SignInMode) => void;
  onSpectatorSubmit: (username: string) => Promise<void> | void;
  onAdminSubmit: (
    username: string,
    password: string,
  ) => Promise<void> | void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "admin") {
      await onAdminSubmit(username, password);
      return;
    }

    await onSpectatorSubmit(username);
  }

  const isAdmin = mode === "admin";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4 sm:p-6">
          <Dialog.Popup
            className={cn(
              "relative w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl",
              "transition-all data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  {isAdmin ? (
                    <ShieldCheck className="size-5" aria-hidden="true" />
                  ) : (
                    <UserRound className="size-5" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <Dialog.Title className="text-base font-semibold text-zinc-950">
                    {isAdmin ? "Admin login" : "Choose a username"}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-zinc-600">
                    {isAdmin
                      ? "Use the configured admin credentials."
                      : "Join the lobby with a spectator username."}
                  </Dialog.Description>
                </div>
              </div>
              {canDismiss ? (
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
              ) : null}
            </header>

            <form className="grid gap-4 px-5 py-5" onSubmit={handleSubmit}>
              <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                Username
                <input
                  className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  maxLength={32}
                  required
                />
              </label>

              {isAdmin ? (
                <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                  Password
                  <input
                    className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertCircle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  <LogIn aria-hidden="true" />
                  {isSubmitting
                    ? "Signing in..."
                    : isAdmin
                      ? "Login as admin"
                      : "Join as spectator"}
                </Button>
                {canDismiss ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPassword("");
                      onModeChange(isAdmin ? "spectator" : "admin");
                    }}
                    disabled={isSubmitting}
                  >
                    {isAdmin ? "Join as spectator" : "Login as admin"}
                  </Button>
                )}
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
