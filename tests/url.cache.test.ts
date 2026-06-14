import { describe, expect, it, vi } from "vitest";

import {
  cacheOriginalUrl,
  getCachedOriginalUrl,
} from "../src/modules/urls/url.cache.js";

describe("URL cache", () => {
  it("reads the original URL using the code cache key", async () => {
    const client = {
      get: vi.fn().mockResolvedValue("https://example.com"),
      set: vi.fn(),
    };

    const result = await getCachedOriginalUrl("example", client);

    expect(client.get).toHaveBeenCalledWith("short-url:example");
    expect(result).toBe("https://example.com");
  });

  it("stores the original URL with the configured TTL", async () => {
    const client = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue("OK"),
    };

    await cacheOriginalUrl("example", "https://example.com", client);

    expect(client.set).toHaveBeenCalledWith(
      "short-url:example",
      "https://example.com",
      { EX: 86_400 },
    );
  });
});
