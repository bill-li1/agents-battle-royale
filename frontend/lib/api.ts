import type {
  ApiErrorBody,
  AuthResponse,
  BackendStateSnapshot,
  ChallengeInput,
  ChallengePublic,
  Game,
  GameState,
  GameInput,
  SessionUser,
} from "@/lib/types";

export const SESSION_TOKEN_STORAGE_KEY = "abr_session_token";
export const LEGACY_ADMIN_TOKEN_STORAGE_KEY = "abr_admin_token";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  body?: unknown;
};

async function requestJson<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as ApiErrorBody | T) : null;

  if (!response.ok) {
    const errorBody = data as ApiErrorBody | null;
    throw new ApiClientError(
      errorBody?.error?.message ?? "Request failed.",
      errorBody?.error?.code ?? "REQUEST_FAILED",
      response.status,
    );
  }

  return data as T;
}

export async function fetchGames(): Promise<GameState[]> {
  const response = await requestJson<{ games: GameState[] }>("/games");
  return response.games;
}

export async function fetchGame(gameId: string): Promise<Game> {
  const response = await requestJson<{ game: Game }>(
    `/games/${encodeURIComponent(gameId)}`,
  );
  return response.game;
}

export async function fetchGameState(gameId: string): Promise<GameState> {
  const response = await requestJson<{ state: GameState }>(
    `/games/${encodeURIComponent(gameId)}/state`,
  );
  return response.state;
}

export function loginAdmin(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function loginSpectator(username: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/auth/spectator", {
    method: "POST",
    body: { username },
  });
}

export async function fetchCurrentUser(token: string): Promise<SessionUser> {
  const response = await requestJson<{ user: SessionUser }>("/auth/me", {
    token,
  });
  return response.user;
}

export async function logBackendState(): Promise<BackendStateSnapshot> {
  const response = await requestJson<{ state: BackendStateSnapshot }>(
    "/debug/state",
    {
      method: "POST",
    },
  );
  return response.state;
}

export async function createGame(
  token: string,
  input: GameInput,
): Promise<Game> {
  const response = await requestJson<{ game: Game }>("/games", {
    method: "POST",
    token,
    body: input,
  });
  return response.game;
}

export async function submitChallenge(
  token: string,
  gameId: string,
  input: ChallengeInput,
): Promise<{ challenge: ChallengePublic; state: GameState }> {
  return requestJson<{ challenge: ChallengePublic; state: GameState }>(
    `/games/${encodeURIComponent(gameId)}/challenges`,
    {
      method: "POST",
      token,
      body: input,
    },
  );
}

export async function deleteQueuedChallenge(
  token: string,
  gameId: string,
  challengeId: string,
): Promise<GameState> {
  const response = await requestJson<{ ok: true; state: GameState }>(
    `/games/${encodeURIComponent(gameId)}/challenges/${encodeURIComponent(
      challengeId,
    )}`,
    {
      method: "DELETE",
      token,
    },
  );
  return response.state;
}

export async function deleteGame(
  token: string,
  gameId: string,
): Promise<void> {
  await requestJson<{ ok: true }>(`/games/${encodeURIComponent(gameId)}`, {
    method: "DELETE",
    token,
  });
}
