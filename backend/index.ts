import { createSpectatorSession, login, requireAdmin, requireSession } from "./auth";
import { config, warnAboutDevelopmentDefaults } from "./config";
import {
  createGame,
  deleteGame,
  deleteQueuedChallenge,
  getGame,
  getGameState,
  listGames,
  logBackendState,
  submitChallenge,
} from "./game-store";
import {
  emptyResponse,
  handleError,
  HttpError,
  jsonResponse,
  readJson,
} from "./http";
import {
  validateChallengeInput,
  validateGameInput,
  validateLoginInput,
  validateSpectatorLoginInput,
} from "./validation";

async function route(request: Request) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "OPTIONS") {
    return emptyResponse(request);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse(request, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const body = validateLoginInput(await readJson(request));
    return jsonResponse(request, await login(body.username, body.password));
  }

  if (request.method === "POST" && url.pathname === "/auth/spectator") {
    const body = validateSpectatorLoginInput(await readJson(request));
    return jsonResponse(request, await createSpectatorSession(body.username));
  }

  if (request.method === "GET" && url.pathname === "/auth/me") {
    return jsonResponse(request, { user: await requireSession(request) });
  }

  if (request.method === "POST" && url.pathname === "/debug/state") {
    return jsonResponse(request, { state: logBackendState() });
  }

  if (request.method === "GET" && url.pathname === "/games") {
    return jsonResponse(request, { games: listGames() });
  }

  if (segments[0] === "games" && segments[1]) {
    const gameId = segments[1];

    if (request.method === "GET" && segments.length === 2) {
      const state = getGameState(gameId);
      if (!state) {
        throw new HttpError(404, "NOT_FOUND", "Game not found.");
      }

      return jsonResponse(request, { game: state.game });
    }

    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[2] === "state"
    ) {
      const state = getGameState(gameId);
      if (!state) {
        throw new HttpError(404, "NOT_FOUND", "Game not found.");
      }

      return jsonResponse(request, { state });
    }

    if (
      request.method === "POST" &&
      segments.length === 3 &&
      segments[2] === "challenges"
    ) {
      const user = await requireSession(request);
      const input = validateChallengeInput(await readJson(request));
      const result = submitChallenge(gameId, input, user.username);
      if (!result) {
        const game = getGame(gameId);
        if (!game) {
          throw new HttpError(404, "NOT_FOUND", "Game not found.");
        }

        throw new HttpError(
          409,
          "CONFLICT",
          "Finished games do not accept new challenges.",
        );
      }

      return jsonResponse(request, result, 201);
    }

    if (
      request.method === "DELETE" &&
      segments.length === 4 &&
      segments[2] === "challenges"
    ) {
      await requireAdmin(request);
      const result = deleteQueuedChallenge(gameId, segments[3]);

      switch (result.status) {
        case "deleted":
          return jsonResponse(request, { ok: true, state: result.state });
        case "game_not_found":
          throw new HttpError(404, "NOT_FOUND", "Game not found.");
        case "challenge_not_found":
          throw new HttpError(404, "NOT_FOUND", "Challenge not found.");
        case "not_queued":
          throw new HttpError(
            409,
            "CONFLICT",
            "Only queued challenges can be deleted.",
          );
      }
    }

    if (request.method === "DELETE" && segments.length === 2) {
      await requireAdmin(request);
      if (!deleteGame(gameId)) {
        throw new HttpError(404, "NOT_FOUND", "Game not found.");
      }

      return jsonResponse(request, { ok: true });
    }
  }

  if (request.method === "POST" && url.pathname === "/games") {
    await requireAdmin(request);
    const input = validateGameInput(await readJson(request));
    const game = createGame(input);
    return jsonResponse(request, { game, state: getGameState(game.id) }, 201);
  }

  throw new HttpError(404, "NOT_FOUND", "Route not found.");
}

warnAboutDevelopmentDefaults();

Bun.serve({
  port: config.port,
  async fetch(request) {
    try {
      return await route(request);
    } catch (error) {
      return handleError(request, error);
    }
  },
});

console.log(`Backend API listening on http://localhost:${config.port}`);
