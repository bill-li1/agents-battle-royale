"use client";

import { Database } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { logBackendState } from "@/lib/api";

export function LogBackendStateButton({
  onError,
}: {
  onError?: (error: unknown) => void;
}) {
  const [isLoggingState, setIsLoggingState] = useState(false);

  async function handleLogBackendState() {
    setIsLoggingState(true);

    try {
      const snapshot = await logBackendState();
      console.log("Backend state snapshot", snapshot);
    } catch (error) {
      console.error("Unable to log backend state", error);
      onError?.(error);
    } finally {
      setIsLoggingState(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void handleLogBackendState()}
      disabled={isLoggingState}
    >
      <Database aria-hidden="true" />
      {isLoggingState ? "Logging..." : "Log state"}
    </Button>
  );
}
