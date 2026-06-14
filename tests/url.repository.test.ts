import { mongo } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DuplicateShortUrlCodeError } from "../src/modules/urls/url.errors.js";
import { ShortUrlModel } from "../src/modules/urls/url.model.js";
import { createShortUrl } from "../src/modules/urls/url.repository.js";

describe("createShortUrl repository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("translates MongoDB duplicate key errors", async () => {
    const duplicateKeyError = new mongo.MongoServerError({
      code: 11_000,
      message: "E11000 duplicate key error",
    });

    vi.spyOn(ShortUrlModel, "create").mockRejectedValueOnce(duplicateKeyError);

    await expect(
      createShortUrl({
        code: "my-alias",
        originalUrl: "https://example.com",
      }),
    ).rejects.toBeInstanceOf(DuplicateShortUrlCodeError);
  });
});
