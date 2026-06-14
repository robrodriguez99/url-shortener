import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/api/app.js";
import { findShortUrlByCode } from "../src/modules/urls/url.repository.js";

vi.mock("../src/modules/urls/url.cache.js", () => ({
  cacheOriginalUrl: vi.fn().mockResolvedValue(undefined),
  getCachedOriginalUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/modules/urls/url.repository.js", () => ({
  createShortUrl: vi.fn(),
  findShortUrlByCode: vi.fn(),
  shortUrlCodeExists: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/urls", () => {
  it("returns a consistent validation error for an invalid body", async () => {
    const response = await request(createApp()).post("/api/urls").send({
      originalUrl: "javascript:alert(1)",
      alias: "invalid alias",
    });

    expect(response.status).toBe(400);
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
      },
    });
  });

  it("returns 400 for a malformed URL", async () => {
    const response = await request(createApp()).post("/api/urls").send({
      originalUrl: "nuevaurl",
    });
    const body = response.body as {
      error: {
        details: Array<{
          path: string;
          message: string;
        }>;
      };
    };

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
      },
    });
    expect(body.error.details).toEqual([
      {
        path: "originalUrl",
        message: "originalUrl must be a valid HTTP or HTTPS URL",
      },
    ]);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(createApp())
      .post("/api/urls")
      .set("Content-Type", "application/json")
      .send('{"originalUrl":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
      },
    });
  });

  it("returns 413 for a body larger than the JSON parser limit", async () => {
    const response = await request(createApp())
      .post("/api/urls")
      .set("Content-Type", "application/json")
      .send(
        JSON.stringify({
          originalUrl: "https://example.com",
          padding: "x".repeat(101 * 1_024),
        }),
      );

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
      },
    });
  });
});

describe("GET /:code", () => {
  it("redirects an existing code to its original URL", async () => {
    vi.mocked(findShortUrlByCode).mockResolvedValue({
      code: "existing-code",
      originalUrl: "https://example.com/destination",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(createApp()).get("/existing-code");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "https://example.com/destination",
    );
  });

  it("returns a not found error for a missing code", async () => {
    vi.mocked(findShortUrlByCode).mockResolvedValue(null);

    const response = await request(createApp()).get("/missing-code");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "SHORT_URL_NOT_FOUND",
        message: 'Short URL code "missing-code" was not found',
      },
    });
  });

  it("returns a validation error for an invalid code", async () => {
    const response = await request(createApp()).get("/ab");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
      },
    });
    expect(findShortUrlByCode).not.toHaveBeenCalled();
  });
});

describe("unknown routes", () => {
  it("returns the public error envelope", async () => {
    const response = await request(createApp()).post("/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found",
      },
    });
  });
});
