import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/api/app.js";
import {
  countClicksByCode,
  findLatestClickByCode,
} from "../src/modules/clicks/click.repository.js";
import { findShortUrlByCode } from "../src/modules/urls/url.repository.js";

vi.mock("../src/modules/clicks/click.repository.js", () => ({
  countClicksByCode: vi.fn(),
  findLatestClickByCode: vi.fn(),
  saveClickEvent: vi.fn(),
}));

vi.mock("../src/modules/urls/url.repository.js", () => ({
  createShortUrl: vi.fn(),
  findShortUrlByCode: vi.fn(),
  shortUrlCodeExists: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/stats/:code", () => {
  it("returns statistics for an existing URL", async () => {
    vi.mocked(findShortUrlByCode).mockResolvedValue({
      code: "example",
      originalUrl: "https://example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(countClicksByCode).mockResolvedValue(2);
    vi.mocked(findLatestClickByCode).mockResolvedValue({
      occurredAt: new Date("2026-06-14T19:00:00.000Z"),
    });

    const response = await request(createApp()).get("/api/stats/example");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      code: "example",
      totalClicks: 2,
      lastClick: "2026-06-14T19:00:00.000Z",
    });
  });

  it("returns not found for an unknown valid code", async () => {
    vi.mocked(findShortUrlByCode).mockResolvedValue(null);

    const response = await request(createApp()).get(
      "/api/stats/missing-code",
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: "SHORT_URL_NOT_FOUND",
      },
    });
  });

  it("returns a validation error for an invalid code", async () => {
    const response = await request(createApp()).get("/api/stats/ab");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
      },
    });
    expect(findShortUrlByCode).not.toHaveBeenCalled();
  });
});
