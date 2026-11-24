export type ApiErrorKind =
  | "InvalidHandle"
  | "NetworkError"
  | "RateLimited"
  | "Blocked"
  | "ParseError"
  | "Timeout";

export interface RustApiError {
  kind: ApiErrorKind;
  message: string;
}

/**
 * Converts a Tauri invoke error (Rust ApiError or string) into a clean,
 * user-friendly Error. Never exposes WKWebView's "Load failed".
 */
export function mapApiError(err: unknown, platformLabel: string): Error {
  if (err && typeof err === "object" && "kind" in err && "message" in err) {
    const e = err as RustApiError;
    switch (e.kind) {
      case "InvalidHandle":
        return new Error(e.message || `Account not found on ${platformLabel}.`);
      case "RateLimited":
        return new Error(`${platformLabel} rate limit reached. Wait a minute and retry.`);
      case "Blocked":
        return new Error(`${platformLabel} blocked the automated request. Try again later.`);
      case "Timeout":
        return new Error(`${platformLabel} timed out. Check your connection and retry.`);
      case "ParseError":
        return new Error(`Unexpected response from ${platformLabel}.`);
      case "NetworkError":
        return new Error(e.message || `Unable to reach ${platformLabel}. Check your connection.`);
    }
  }
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.toLowerCase().includes("load failed")) {
    return new Error(`Unable to reach ${platformLabel}. Check your connection.`);
  }
  return new Error(raw || `${platformLabel} request failed.`);
}
