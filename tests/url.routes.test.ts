import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/api/app.js";
import { findShortUrlByCode } from "../src/modules/urls/url.repository.js";

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
