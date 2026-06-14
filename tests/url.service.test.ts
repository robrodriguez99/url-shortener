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
  it("returns a cached original URL without querying MongoDB", async () => {
    const findShortUrlByCode = vi.fn();
    const cacheOriginalUrl = vi.fn();

    const result = await resolveUrl("cached-code", {
      getCachedOriginalUrl: vi
        .fn()
        .mockResolvedValue("https://example.com/cached"),
      findShortUrlByCode,
      cacheOriginalUrl,
    });

    expect(result).toBe("https://example.com/cached");
    expect(findShortUrlByCode).not.toHaveBeenCalled();
    expect(cacheOriginalUrl).not.toHaveBeenCalled();
  });

  it("queries MongoDB and populates the cache on a cache miss", async () => {
    const findShortUrlByCode = vi.fn().mockResolvedValue({
      originalUrl: "https://example.com/destination",
    });
    const cacheOriginalUrl = vi.fn().mockResolvedValue(undefined);

    const result = await resolveUrl("existing-code", {
      getCachedOriginalUrl: vi.fn().mockResolvedValue(null),
      findShortUrlByCode,
      cacheOriginalUrl,
    });

    expect(findShortUrlByCode).toHaveBeenCalledWith("existing-code");
    expect(cacheOriginalUrl).toHaveBeenCalledWith(
      "existing-code",
      "https://example.com/destination",
    );
    expect(result).toBe("https://example.com/destination");
  });

  it("throws a not found error for a missing code", async () => {
    await expect(
      resolveUrl("missing-code", {
        getCachedOriginalUrl: vi.fn().mockResolvedValue(null),
        findShortUrlByCode: vi.fn().mockResolvedValue(null),
        cacheOriginalUrl: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(ShortUrlNotFoundError);
  });

  it("falls back to MongoDB when reading from Redis fails", async () => {
    const findShortUrlByCode = vi.fn().mockResolvedValue({
      originalUrl: "https://example.com/fallback",
    });

    const result = await resolveUrl("existing-code", {
      getCachedOriginalUrl: vi
        .fn()
        .mockRejectedValue(new Error("Redis unavailable")),
      findShortUrlByCode,
      cacheOriginalUrl: vi.fn().mockResolvedValue(undefined),
    });

    expect(findShortUrlByCode).toHaveBeenCalledWith("existing-code");
    expect(result).toBe("https://example.com/fallback");
  });

  it("returns the MongoDB URL when writing to Redis fails", async () => {
    const result = await resolveUrl("existing-code", {
      getCachedOriginalUrl: vi.fn().mockResolvedValue(null),
      findShortUrlByCode: vi.fn().mockResolvedValue({
        originalUrl: "https://example.com/destination",
      }),
      cacheOriginalUrl: vi
        .fn()
        .mockRejectedValue(new Error("Redis unavailable")),
    });

    expect(result).toBe("https://example.com/destination");
  });

  it("validates the code before calling the repository", async () => {
    const getCachedOriginalUrl = vi.fn();
    const findShortUrlByCode = vi.fn();

    await expect(
      resolveUrl("invalid code", {
        getCachedOriginalUrl,
        findShortUrlByCode,
        cacheOriginalUrl: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: "ZodError" });

    expect(getCachedOriginalUrl).not.toHaveBeenCalled();
    expect(findShortUrlByCode).not.toHaveBeenCalled();
  });
});
