import { describe, expect, it, vi } from "vitest";

import { ShortUrlNotFoundError } from "../src/modules/urls/url.errors.js";
import { getUrlStats } from "../src/modules/clicks/click.service.js";

describe("getUrlStats", () => {
  it("returns total clicks and the latest click", async () => {
    const countClicksByCode = vi.fn().mockResolvedValue(12);
    const findLatestClickByCode = vi.fn().mockResolvedValue({
      occurredAt: new Date("2026-06-14T19:00:00.000Z"),
    });

    const result = await getUrlStats("example", {
      findShortUrlByCode: vi.fn().mockResolvedValue({ code: "example" }),
      countClicksByCode,
      findLatestClickByCode,
    });

    expect(countClicksByCode).toHaveBeenCalledWith("example");
    expect(findLatestClickByCode).toHaveBeenCalledWith("example");
    expect(result).toEqual({
      code: "example",
      totalClicks: 12,
      lastClick: "2026-06-14T19:00:00.000Z",
    });
  });

  it("returns zero and null when the URL has no clicks", async () => {
    const result = await getUrlStats("example", {
      findShortUrlByCode: vi.fn().mockResolvedValue({ code: "example" }),
      countClicksByCode: vi.fn().mockResolvedValue(0),
      findLatestClickByCode: vi.fn().mockResolvedValue(null),
    });

    expect(result).toEqual({
      code: "example",
      totalClicks: 0,
      lastClick: null,
    });
  });

  it("throws not found before querying clicks for an unknown code", async () => {
    const countClicksByCode = vi.fn();
    const findLatestClickByCode = vi.fn();

    await expect(
      getUrlStats("missing-code", {
        findShortUrlByCode: vi.fn().mockResolvedValue(null),
        countClicksByCode,
        findLatestClickByCode,
      }),
    ).rejects.toBeInstanceOf(ShortUrlNotFoundError);

    expect(countClicksByCode).not.toHaveBeenCalled();
    expect(findLatestClickByCode).not.toHaveBeenCalled();
  });

  it("validates the code before querying repositories", async () => {
    const findShortUrlByCode = vi.fn();

    await expect(
      getUrlStats("ab", {
        findShortUrlByCode,
        countClicksByCode: vi.fn(),
        findLatestClickByCode: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: "ZodError" });

    expect(findShortUrlByCode).not.toHaveBeenCalled();
  });
});
