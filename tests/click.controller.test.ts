import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getUrlStatsController } from "../src/modules/clicks/click.controller.js";
import {
  getUrlStats,
  type UrlStatsResult,
} from "../src/modules/clicks/click.service.js";

vi.mock("../src/modules/clicks/click.service.js", () => ({
  getUrlStats: vi.fn(),
}));

describe("getUrlStatsController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns URL statistics with 200", async () => {
    const result: UrlStatsResult = {
      code: "example",
      totalClicks: 12,
      lastClick: "2026-06-14T19:00:00.000Z",
    };
    const request = {
      params: { code: "example" },
    } as Request<{ code: string }>;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const response = { status } as unknown as Response<typeof result>;

    vi.mocked(getUrlStats).mockResolvedValue(result);

    await getUrlStatsController(request, response);

    expect(getUrlStats).toHaveBeenCalledWith("example");
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(result);
  });
});
