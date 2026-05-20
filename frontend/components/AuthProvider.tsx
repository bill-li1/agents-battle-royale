"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { SignInModal, type SignInMode } from "@/components/SignInModal";
import {
  fetchCurrentUser,
  LEGACY_ADMIN_TOKEN_STORAGE_KEY,
  loginAdmin,
  loginSpectator,
  SESSION_TOKEN_STORAGE_KEY,
} from "@/lib/api";
import type { SessionUser } from "@/lib/types";

type AuthContextValue = {
  token: string | null;
  user: SessionUser | null;
  isCheckingSession: boolean;
  isAdmin: boolean;
  logout: () => void;
  openSignIn: (mode?: SignInMode) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken() {
  return (
    window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY)
  );
}

function clearStoredTokens() {
  window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<SignInMode>("spectator");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canDismissSignIn = Boolean(token && user);

  const openSignIn = useCallback((nextMode: SignInMode = "spectator") => {
    setMode(nextMode);
    setError(null);
    setIsModalOpen(true);
  }, []);

  const handleSignInOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setIsModalOpen(true);
        return;
      }

      if (!token || !user) {
        return;
      }

      setIsModalOpen(false);
      setError(null);
      setMode(user.role === "admin" ? "admin" : "spectator");
    },
    [token, user],
  );

  const logout = useCallback(() => {
    clearStoredTokens();
    setToken(null);
    setUser(null);
    openSignIn("spectator");
  }, [openSignIn]);

  const persistSession = useCallback(
    (nextToken: string, nextUser: SessionUser) => {
      window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, nextToken);
      window.localStorage.removeItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY);
      setToken(nextToken);
      setUser(nextUser);
      setIsModalOpen(false);
      setError(null);
    },
    [],
  );

  useEffect(() => {
    let isActive = true;

    async function validateStoredSession() {
      const storedToken = readStoredToken();

      if (!storedToken) {
        if (isActive) {
          setIsCheckingSession(false);
          openSignIn("spectator");
        }
        return;
      }

      try {
        const currentUser = await fetchCurrentUser(storedToken);
        if (isActive) {
          persistSession(storedToken, currentUser);
        }
      } catch {
        clearStoredTokens();
        if (isActive) {
          setToken(null);
          setUser(null);
          openSignIn("spectator");
        }
      } finally {
        if (isActive) {
          setIsCheckingSession(false);
        }
      }
    }

    void validateStoredSession();

    return () => {
      isActive = false;
    };
  }, [openSignIn, persistSession]);

  async function handleSpectatorSubmit(username: string) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await loginSpectator(username);
      persistSession(response.token, response.user);
    } catch (signInError) {
      setError(
        signInError instanceof Error ? signInError.message : "Unable to join.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAdminSubmit(username: string, password: string) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await loginAdmin(username, password);
      persistSession(response.token, response.user);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Unable to login.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isCheckingSession,
      isAdmin: user?.role === "admin",
      logout,
      openSignIn,
    }),
    [isCheckingSession, logout, openSignIn, token, user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInModal
        open={!isCheckingSession && isModalOpen}
        canDismiss={canDismissSignIn}
        mode={mode}
        isSubmitting={isSubmitting}
        error={error}
        onOpenChange={handleSignInOpenChange}
        onModeChange={(nextMode) => {
          setError(null);
          setMode(nextMode);
        }}
        onSpectatorSubmit={handleSpectatorSubmit}
        onAdminSubmit={handleAdminSubmit}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
