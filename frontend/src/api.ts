export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{
      path?: string;
      message: string;
    }>;
  };
};

export type CreatedUrl = {
  code: string;
  originalUrl: string;
  shortUrl: string;
};

export type UrlStats = {
  code: string;
  totalClicks: number;
  lastClick: string | null;
};

export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ApiErrorBody;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody;
    const detailMessage = errorBody.error?.details?.[0]?.message;

    throw new ApiError(
      detailMessage ??
        errorBody.error?.message ??
        "No se pudo completar la solicitud",
      errorBody.error?.code,
    );
  }

  return body as T;
}

export function createShortUrl(
  originalUrl: string,
  alias: string,
): Promise<CreatedUrl> {
  return requestJson<CreatedUrl>("/api/urls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      originalUrl,
      ...(alias === "" ? {} : { alias }),
    }),
  });
}

export function getUrlStats(code: string): Promise<UrlStats> {
  return requestJson<UrlStats>(`/api/stats/${encodeURIComponent(code)}`);
}

export function buildShortUrl(code: string): string {
  const configuredOrigin = import.meta.env.VITE_API_ORIGIN as
    | string
    | undefined;
  const origin =
    configuredOrigin === undefined || configuredOrigin === ""
      ? window.location.origin
      : configuredOrigin;

  return `${origin.replace(/\/$/, "")}/${encodeURIComponent(code)}`;
}
