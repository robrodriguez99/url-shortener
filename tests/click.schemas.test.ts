import { describe, expect, it } from "vitest";

import {
  TINY_URL_ACCESSED_EVENT_TYPE,
  tinyUrlAccessedEventSchema,
} from "../src/modules/clicks/click.schemas.js";

describe("tinyUrlAccessedEventSchema", () => {
  it("accepts a valid click event", () => {
    const result = tinyUrlAccessedEventSchema.safeParse({
      eventId: "a9df919d-8e2a-44d6-84d6-63304c86267f",
      type: TINY_URL_ACCESSED_EVENT_TYPE,
      occurredAt: "2026-06-11T15:30:00.000Z",
      data: {
        code: "AbC123",
        ip: "127.0.0.1",
        userAgent: "curl/8.7.1",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid event type or date", () => {
    const result = tinyUrlAccessedEventSchema.safeParse({
      eventId: "a9df919d-8e2a-44d6-84d6-63304c86267f",
      type: "tinyurl.created.v1",
      occurredAt: "not-a-date",
      data: {
        code: "AbC123",
      },
    });

    expect(result.success).toBe(false);
  });
});
