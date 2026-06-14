import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishTinyUrlAccessedEvent } from "../src/modules/clicks/click.publisher.js";
import { getRabbitMqPublisherChannel } from "../src/infrastructure/rabbitmq/connection.js";
import {
  TINY_URL_ACCESSED_EVENT_TYPE,
  type TinyUrlAccessedEvent,
} from "../src/modules/clicks/click.schemas.js";

const publish = vi.fn();
const waitForConfirms = vi.fn();

vi.mock("../src/infrastructure/config/env.js", () => ({
  config: {
    rabbitmqExchange: "tinyurl.events",
    rabbitmqPublishTimeoutMs: 1_000,
  },
}));

vi.mock("../src/infrastructure/rabbitmq/connection.js", () => ({
  getRabbitMqPublisherChannel: vi.fn(),
}));

describe("publishTinyUrlAccessedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRabbitMqPublisherChannel).mockReturnValue({
      publish,
      waitForConfirms,
    } as never);
    waitForConfirms.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes a persistent event and waits for broker confirmation", async () => {
    const event: TinyUrlAccessedEvent = {
      eventId: "a9df919d-8e2a-44d6-84d6-63304c86267f",
      type: TINY_URL_ACCESSED_EVENT_TYPE,
      occurredAt: "2026-06-14T12:00:00.000Z",
      data: {
        code: "example",
        ip: "127.0.0.1",
        userAgent: "curl/8.7.1",
      },
    };

    await publishTinyUrlAccessedEvent(event);

    expect(publish).toHaveBeenCalledWith(
      "tinyurl.events",
      TINY_URL_ACCESSED_EVENT_TYPE,
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        contentType: "application/json",
        type: TINY_URL_ACCESSED_EVENT_TYPE,
        messageId: event.eventId,
      },
    );
    expect(waitForConfirms).toHaveBeenCalledOnce();
  });

  it("rejects an invalid event before publishing", async () => {
    await expect(
      publishTinyUrlAccessedEvent({
        eventId: "invalid",
        type: TINY_URL_ACCESSED_EVENT_TYPE,
        occurredAt: "not-a-date",
        data: { code: "example" },
      }),
    ).rejects.toMatchObject({ name: "ZodError" });

    expect(publish).not.toHaveBeenCalled();
  });

  it("times out when the broker does not confirm the publication", async () => {
    vi.useFakeTimers();
    waitForConfirms.mockReturnValue(new Promise(() => undefined));

    const publication = publishTinyUrlAccessedEvent({
      eventId: "a9df919d-8e2a-44d6-84d6-63304c86267f",
      type: TINY_URL_ACCESSED_EVENT_TYPE,
      occurredAt: "2026-06-14T12:00:00.000Z",
      data: {
        code: "example",
      },
    });
    const expectation = expect(publication).rejects.toThrow(
      "RabbitMQ publisher confirmation timed out",
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });
});
