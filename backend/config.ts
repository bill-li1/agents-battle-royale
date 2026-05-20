const DEFAULT_PORT = 4000;
const DEFAULT_FRONTEND_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
];
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";
const DEFAULT_JWT_SECRET =
  "development-only-agents-battle-royale-jwt-secret-change-me";
const DEFAULT_ADMIN_TOKEN_TTL_SECONDS = 86400;
const DEFAULT_SKIRMISH_TIMEOUT_MS = 60_000;
const DEFAULT_EXECUTOR_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_EXECUTOR_CODE_CHARS = 12_000;
const DEFAULT_MAX_EXECUTOR_OUTPUT_CHARS = 8_000;

function readInteger(name: string, fallback: number) {
  const value = Bun.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOrigins(name: string, fallback: string[]) {
  const value = Bun.env[name];
  if (!value) {
    return fallback;
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : fallback;
}

export const config = {
  port: readInteger("PORT", DEFAULT_PORT),
  frontendOrigins: readOrigins("FRONTEND_ORIGIN", DEFAULT_FRONTEND_ORIGINS),
  adminUsername: Bun.env.ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME,
  adminPassword: Bun.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD,
  jwtSecret: Bun.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
  adminTokenTtlSeconds: readInteger(
    "ADMIN_TOKEN_TTL_SECONDS",
    DEFAULT_ADMIN_TOKEN_TTL_SECONDS,
  ),
  skirmishTimeoutMs: readInteger(
    "SKIRMISH_TIMEOUT_MS",
    DEFAULT_SKIRMISH_TIMEOUT_MS,
  ),
  executorTimeoutMs: readInteger(
    "EXECUTOR_TIMEOUT_MS",
    DEFAULT_EXECUTOR_TIMEOUT_MS,
  ),
  maxExecutorCodeChars: readInteger(
    "MAX_EXECUTOR_CODE_CHARS",
    DEFAULT_MAX_EXECUTOR_CODE_CHARS,
  ),
  maxExecutorOutputChars: readInteger(
    "MAX_EXECUTOR_OUTPUT_CHARS",
    DEFAULT_MAX_EXECUTOR_OUTPUT_CHARS,
  ),
};

export function warnAboutDevelopmentDefaults() {
  if (!Bun.env.ADMIN_USERNAME) {
    console.warn(
      "ADMIN_USERNAME is not set; using development default username 'admin'.",
    );
  }

  if (!Bun.env.ADMIN_PASSWORD) {
    console.warn(
      "ADMIN_PASSWORD is not set; using development default password 'admin'.",
    );
  }

  if (!Bun.env.JWT_SECRET) {
    console.warn(
      "JWT_SECRET is not set; using a development-only signing secret.",
    );
  }
}
