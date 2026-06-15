import { describe, expect, it } from "vitest";

import { LOGGER_REDACT_PATHS } from "../src/shared/logger/logger.js";

describe("logger redaction", () => {
  it("redacts sensitive request headers and redirect destinations", () => {
    expect(LOGGER_REDACT_PATHS).toEqual([
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.location",
    ]);
  });
});
