import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUrlController,
  resolveUrlController,
} from "../src/modules/urls/url.controller.js";
import {
  createUrl,
  resolveUrl,
} from "../src/modules/urls/url.service.js";

vi.mock("../src/infrastructure/config/env.js", () => ({
  config: {
    baseUrl: "http://localhost:3000",
  },
}));

vi.mock("../src/modules/urls/url.service.js", () => ({
  createUrl: vi.fn(),
  resolveUrl: vi.fn(),
}));

describe("createUrlController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a URL and returns 201", async () => {
    const requestBody = {
      originalUrl: "https://example.com",
      alias: "example",
    };
    const result = {
      code: "example",
      originalUrl: "https://example.com",
      shortUrl: "http://localhost:3000/example",
    };
    const request = { body: requestBody } as Request;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const response = { status } as unknown as Response<typeof result>;

    vi.mocked(createUrl).mockResolvedValue(result);

    await createUrlController(request, response);

    expect(createUrl).toHaveBeenCalledWith(
      requestBody,
      "http://localhost:3000",
    );
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(result);
  });
});

describe("resolveUrlController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the resolved original URL", async () => {
    const request = {
      params: { code: "example" },
    } as Request<{ code: string }>;
    const redirect = vi.fn();
    const response = { redirect } as unknown as Response;

    vi.mocked(resolveUrl).mockResolvedValue("https://example.com/destination");

    await resolveUrlController(request, response);

    expect(resolveUrl).toHaveBeenCalledWith("example");
    expect(redirect).toHaveBeenCalledWith(
      302,
      "https://example.com/destination",
    );
  });
});
