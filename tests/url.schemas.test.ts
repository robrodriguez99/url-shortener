import { describe, expect, it } from "vitest";

import { createUrlSchema } from "../src/modules/urls/url.schemas.js";

describe("createUrlSchema", () => {
  it("accepts HTTP and HTTPS URLs", () => {
    expect(
      createUrlSchema.safeParse({ originalUrl: "http://example.com" }).success,
    ).toBe(true);
    expect(
      createUrlSchema.safeParse({ originalUrl: "https://example.com" }).success,
    ).toBe(true);
  });

  it("rejects URLs using other protocols", () => {
    expect(
      createUrlSchema.safeParse({ originalUrl: "ftp://example.com" }).success,
    ).toBe(false);
  });

  it("validates an optional alias", () => {
    expect(
      createUrlSchema.safeParse({
        originalUrl: "https://example.com",
        alias: "my_alias-1",
      }).success,
    ).toBe(true);
    expect(
      createUrlSchema.safeParse({
        originalUrl: "https://example.com",
        alias: "",
      }).success,
    ).toBe(false);
    expect(
      createUrlSchema.safeParse({
        originalUrl: "https://example.com",
        alias: "invalid alias",
      }).success,
    ).toBe(false);
  });
});
