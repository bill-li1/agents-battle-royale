import { config } from "./config";
import type { ApiErrorCode, ApiErrorResponse } from "./types";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function resolveAllowedOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && config.frontendOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return config.frontendOrigins[0];
}

export function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(request),
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    Vary: "Origin",
  };
}

export function jsonResponse(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
    },
  });
}

export function emptyResponse(request: Request, status = 204) {
  return new Response(null, {
    status,
    headers: corsHeaders(request),
  });
}

export function errorResponse(
  request: Request,
  code: ApiErrorCode,
  message: string,
  status: number,
) {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return jsonResponse(request, body, status);
}

export async function readJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "Request body must be application/json.",
    );
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Request body is not valid JSON.");
  }
}

export function handleError(request: Request, error: unknown) {
  if (error instanceof HttpError) {
    return errorResponse(request, error.code, error.message, error.status);
  }

  console.error(error);
  return errorResponse(
    request,
    "INTERNAL_ERROR",
    "Unexpected server error.",
    500,
  );
}
