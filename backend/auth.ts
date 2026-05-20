import { SignJWT, jwtVerify } from "jose";

import { config } from "./config";
import { HttpError } from "./http";
import type { LoginResponse, SessionUser, UserRole } from "./types";

const ISSUER = "agents-battle-royale-backend";
const encoder = new TextEncoder();

function getSecret() {
  return encoder.encode(config.jwtSecret);
}

function isConfiguredAdminUsername(username: string) {
  return username.toLowerCase() === config.adminUsername.toLowerCase();
}

async function createSession(user: SessionUser): Promise<LoginResponse> {
  const token = await new SignJWT({ role: user.role, username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(`${user.role}:${user.username}`)
    .setIssuedAt()
    .setExpirationTime(`${config.adminTokenTtlSeconds}s`)
    .sign(getSecret());

  return {
    token,
    expiresIn: config.adminTokenTtlSeconds,
    user,
  };
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  if (!isConfiguredAdminUsername(username) || password !== config.adminPassword) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid admin credentials.");
  }

  return createSession({
    username: config.adminUsername,
    role: "admin",
  });
}

export async function createSpectatorSession(
  username: string,
): Promise<LoginResponse> {
  if (isConfiguredAdminUsername(username)) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "That username is reserved for the admin.",
    );
  }

  return createSession({
    username,
    role: "spectator",
  });
}

export async function requireSession(request: Request): Promise<SessionUser> {
  const authorization = request.headers.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "UNAUTHORIZED", "Authorization required.");
  }

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
    });

    const role = payload.role;
    const username = payload.username;

    if (!isUserRole(role) || typeof username !== "string" || !username) {
      throw new Error("Invalid session.");
    }

    return { username, role };
  } catch {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired session.");
  }
}

export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = await requireSession(request);

  if (user.role !== "admin") {
    throw new HttpError(403, "FORBIDDEN", "Admin authorization required.");
  }

  return user;
}

function isUserRole(value: unknown): value is UserRole {
  return value === "spectator" || value === "admin";
}
