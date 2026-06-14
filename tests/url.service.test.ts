import { describe, expect, it, vi } from "vitest";

import {
  DuplicateShortUrlCodeError,
  ShortUrlCodeConflictError,
  ShortUrlNotFoundError,
} from "../src/modules/urls/url.errors.js";
import type { ShortUrlCodeGenerationError } from "../src/modules/urls/url.errors.js";
import {
  createUrl,
  resolveUrl,
} from "../src/modules/urls/url.service.js";

const baseUrl = "http://localhost:3000";

describe("createUrl", () => {
  it("creates a short URL with a custom alias", async () => {
    const createShortUrl = vi.fn().mockResolvedValue({
      code: "my-alias",
      originalUrl: "https://example.com",
    });

    const result = await createUrl(
      {
        originalUrl: "https://example.com",
        alias: "my-alias",
      },
      baseUrl,
      {
        createShortUrl,
        shortUrlCodeExists: vi.fn().mockResolvedValue(false),
        generateCode: vi.fn(),
      },
    );

    expect(createShortUrl).toHaveBeenCalledWith({
      code: "my-alias",
      originalUrl: "https://example.com",
    });
    expect(result.shortUrl).toBe("http://localhost:3000/my-alias");
  });

  it("rejects an alias that is already in use", async () => {
    await expect(
      createUrl(
        {
          originalUrl: "https://example.com",
          alias: "my-alias",
        },
        baseUrl,
        {
          createShortUrl: vi.fn(),
          shortUrlCodeExists: vi.fn().mockResolvedValue(true),
          generateCode: vi.fn(),
        },
      ),
    ).rejects.toBeInstanceOf(ShortUrlCodeConflictError);
  });

  it("generates a code when no alias is provided", async () => {
    const createShortUrl = vi.fn().mockResolvedValue({
      code: "AbC123_x",
      originalUrl: "https://example.com",
    });

    const result = await createUrl(
      { originalUrl: "https://example.com" },
      baseUrl,
      {
        createShortUrl,
        shortUrlCodeExists: vi.fn(),
        generateCode: vi.fn().mockReturnValue("AbC123_x"),
      },
    );

    expect(createShortUrl).toHaveBeenCalledWith({
      code: "AbC123_x",
      originalUrl: "https://example.com",
    });
    expect(result.code).toBe("AbC123_x");
  });

  it("retries when a generated code collides", async () => {
    const createShortUrl = vi
      .fn()
      .mockRejectedValueOnce(new DuplicateShortUrlCodeError("first"))
      .mockResolvedValueOnce({
        code: "second",
        originalUrl: "https://example.com",
      });
    const generateCode = vi
      .fn()
      .mockReturnValueOnce("first")
      .mockReturnValueOnce("second");

    const result = await createUrl(
      { originalUrl: "https://example.com" },
      baseUrl,
      {
        createShortUrl,
        shortUrlCodeExists: vi.fn(),
        generateCode,
      },
    );

    expect(generateCode).toHaveBeenCalledTimes(2);
    expect(result.code).toBe("second");
  });

  it("validates its input before calling the repository", async () => {
    const createShortUrl = vi.fn();

    await expect(
      createUrl(
        {
          originalUrl: "ftp://example.com",
          alias: "invalid alias",
        },
        baseUrl,
        {
          createShortUrl,
          shortUrlCodeExists: vi.fn(),
          generateCode: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ name: "ZodError" });

    expect(createShortUrl).not.toHaveBeenCalled();
  });

  it("throws a typed error after exhausting generated code attempts", async () => {
    await expect(
      createUrl({ originalUrl: "https://example.com" }, baseUrl, {
        createShortUrl: vi
          .fn()
          .mockRejectedValue(new DuplicateShortUrlCodeError("duplicate")),
        shortUrlCodeExists: vi.fn(),
        generateCode: vi.fn().mockReturnValue("duplicate"),
      }),
    ).rejects.toMatchObject({
      code: "SHORT_URL_CODE_GENERATION_FAILED",
      statusCode: 500,
    } satisfies Partial<ShortUrlCodeGenerationError>);
  });
});

describe("resolveUrl", () => {
  it("returns the original URL for an existing code", async () => {
    const findShortUrlByCode = vi.fn().mockResolvedValue({
      originalUrl: "https://example.com/destination",
    });

    const result = await resolveUrl("existing-code", {
      findShortUrlByCode,
    });

    expect(findShortUrlByCode).toHaveBeenCalledWith("existing-code");
    expect(result).toBe("https://example.com/destination");
  });

  it("throws a not found error for a missing code", async () => {
    await expect(
      resolveUrl("missing-code", {
        findShortUrlByCode: vi.fn().mockResolvedValue(null),
      }),
    ).rejects.toBeInstanceOf(ShortUrlNotFoundError);
  });

  it("validates the code before calling the repository", async () => {
    const findShortUrlByCode = vi.fn();

    await expect(
      resolveUrl("invalid code", { findShortUrlByCode }),
    ).rejects.toMatchObject({ name: "ZodError" });

    expect(findShortUrlByCode).not.toHaveBeenCalled();
  });
});
