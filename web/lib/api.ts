// ─── Typed API Client ─────────────────────────────────────────────────────────
//
// Thin wrapper around fetch that:
//   - Prepends the API base URL
//   - Attaches the Bearer token from storage
//   - Auto-refreshes the token on 401
//   - Returns typed responses

import { getTokens, setTokens, clearTokens } from "./auth";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const API_URL =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
  retrying = false
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (tokens?.accessToken) {
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  const url = path.startsWith("http") ? path : `${API_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  // Handle token refresh on 401
  if (response.status === 401 && !retrying && tokens?.refreshToken) {
    try {
      const refreshResult = await request<{
        tokens: {
          accessToken: string;
          refreshToken: string;
          expiresAt: number;
        };
      }>(
        "POST",
        "/auth/refresh",
        { refreshToken: tokens.refreshToken },
        {},
        true // retrying = true to prevent infinite loop
      );

      setTokens({
        accessToken: refreshResult.tokens.accessToken,
        refreshToken: refreshResult.tokens.refreshToken,
        expiresAt: refreshResult.tokens.expiresAt,
        tokenType: "Bearer",
      });

      // Retry original request with new token
      return request<T>(method, path, body, options, true);
    } catch {
      clearTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new ApiError(401, "Session expired. Please log in again.");
    }
  }

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    const message =
      typeof errorBody === "object" &&
      errorBody !== null &&
      "message" in errorBody
        ? String((errorBody as { message: unknown }).message)
        : `HTTP ${response.status}`;

    throw new ApiError(response.status, message, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ─── Public API client ────────────────────────────────────────────────────────

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>("GET", path, undefined, options);
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("POST", path, body, options);
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("PATCH", path, body, options);
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("PUT", path, body, options);
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>("DELETE", path, undefined, options);
  },
};

// ─── Typed endpoint helpers ───────────────────────────────────────────────────

export { apiClient as default };
