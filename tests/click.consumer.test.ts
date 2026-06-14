import type { Channel, ConsumeMessage } from "amqplib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLICK_MESSAGE_RESULT,
  processClickMessage,
  startClickConsumer,
} from "../src/modules/clicks/click.consumer.js";
import { createRabbitMqConsumerChannel } from "../src/infrastructure/rabbitmq/connection.js";
import { saveClickEvent } from "../src/modules/clicks/click.repository.js";
import { TINY_URL_ACCESSED_EVENT_TYPE } from "../src/modules/clicks/click.schemas.js";

vi.mock("../src/infrastructure/config/env.js", () => ({
  config: {
    rabbitmqAccessQueue: "tinyurl.accessed.persist",
  },
}));

vi.mock("../src/infrastructure/rabbitmq/connection.js", () => ({
  createRabbitMqConsumerChannel: vi.fn(),
}));

vi.mock("../src/modules/clicks/click.repository.js", () => ({
  saveClickEvent: vi.fn(),
}));

const validEvent = {
  eventId: "a9df919d-8e2a-44d6-84d6-63304c86267f",
  type: TINY_URL_ACCESSED_EVENT_TYPE,
  occurredAt: "2026-06-14T12:00:00.000Z",
  data: {
    code: "example",
  },
};

describe("processClickMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["created", "duplicate"] as const)(
    "acknowledges a %s event",
    async (repositoryResult) => {
      vi.mocked(saveClickEvent).mockResolvedValue(repositoryResult);

      const result = await processClickMessage(
        Buffer.from(JSON.stringify(validEvent)),
      );

      expect(result).toBe(CLICK_MESSAGE_RESULT.ACK);
      expect(saveClickEvent).toHaveBeenCalledWith(validEvent);
    },
  );

  it("rejects malformed or invalid events without persistence", async () => {
    const result = await processClickMessage(
      Buffer.from('{"type":"unknown"}'),
    );

    expect(result).toBe(CLICK_MESSAGE_RESULT.REJECT);
    expect(saveClickEvent).not.toHaveBeenCalled();
  });

  it("requeues events after an unexpected persistence failure", async () => {
    vi.mocked(saveClickEvent).mockRejectedValue(
      new Error("MongoDB unavailable"),
    );

    const result = await processClickMessage(
      Buffer.from(JSON.stringify(validEvent)),
    );

    expect(result).toBe(CLICK_MESSAGE_RESULT.REQUEUE);
  });
});

describe("startClickConsumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consumes with manual acknowledgements and prefetch", async () => {
    const prefetch = vi.fn().mockResolvedValue(undefined);
    const consume = vi.fn().mockResolvedValue({ consumerTag: "test" });
    const channel = {
      on: vi.fn(),
      prefetch,
      consume,
      close: vi.fn(),
    } as unknown as Channel;

    vi.mocked(createRabbitMqConsumerChannel).mockResolvedValue(channel);

    await expect(startClickConsumer()).resolves.toBe(channel);

    expect(prefetch).toHaveBeenCalledWith(10);
    expect(consume).toHaveBeenCalledWith(
      "tinyurl.accessed.persist",
      expect.any(Function),
      { noAck: false },
    );
  });

  it("closes the channel when subscription setup fails", async () => {
    const error = new Error("RabbitMQ unavailable");
    const close = vi.fn().mockResolvedValue(undefined);
    const channel = {
      on: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockRejectedValue(error),
      close,
    } as unknown as Channel;

    vi.mocked(createRabbitMqConsumerChannel).mockResolvedValue(channel);

    await expect(startClickConsumer()).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    [CLICK_MESSAGE_RESULT.ACK, "ack"],
    [CLICK_MESSAGE_RESULT.REJECT, "reject"],
    [CLICK_MESSAGE_RESULT.REQUEUE, "nack"],
  ] as const)(
    "applies the %s delivery result",
    async (result, method) => {
      const message = {
        content: Buffer.from(JSON.stringify(validEvent)),
      } as ConsumeMessage;
      const ack = vi.fn();
      const nack = vi.fn();
      const reject = vi.fn();
      let deliveryHandler:
        | ((message: ConsumeMessage | null) => void)
        | undefined;
      const channel = {
        on: vi.fn(),
        prefetch: vi.fn().mockResolvedValue(undefined),
        consume: vi.fn(
          (
            _queue: string,
            handler: (message: ConsumeMessage | null) => void,
          ) => {
            deliveryHandler = handler;
            return Promise.resolve({ consumerTag: "test" });
          },
        ),
        ack,
        nack,
        reject,
        close: vi.fn(),
      } as unknown as Channel;

      vi.mocked(createRabbitMqConsumerChannel).mockResolvedValue(channel);
      vi.mocked(saveClickEvent).mockImplementation(() => {
        if (result === "ack") {
          return Promise.resolve("created");
        }
        if (result === "requeue") {
          return Promise.reject(new Error("MongoDB unavailable"));
        }
        return Promise.resolve("created");
      });

      await startClickConsumer();

      if (result === "reject") {
        message.content = Buffer.from('{"invalid":true}');
      }
      deliveryHandler?.(message);
      await vi.waitFor(() => {
        expect(
          method === "ack"
            ? ack
            : method === "reject"
              ? reject
              : nack,
        ).toHaveBeenCalled();
      });

      if (method === "ack") {
        expect(ack).toHaveBeenCalledWith(message);
      } else if (method === "reject") {
        expect(reject).toHaveBeenCalledWith(message, false);
      } else {
        expect(nack).toHaveBeenCalledWith(message, false, true);
      }
    },
  );
});
