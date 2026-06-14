import { config } from "../../infrastructure/config/env.js";
import { getRabbitMqPublisherChannel } from "../../infrastructure/rabbitmq/connection.js";
import {
  TINY_URL_ACCESSED_EVENT_TYPE,
  tinyUrlAccessedEventSchema,
  type TinyUrlAccessedEvent,
} from "./click.schemas.js";

export async function publishTinyUrlAccessedEvent(
  event: TinyUrlAccessedEvent,
): Promise<void> {
  const validatedEvent = tinyUrlAccessedEventSchema.parse(event);
  const channel = getRabbitMqPublisherChannel();

  channel.publish(
    config.rabbitmqExchange,
    TINY_URL_ACCESSED_EVENT_TYPE,
    Buffer.from(JSON.stringify(validatedEvent)),
    {
      persistent: true,
      contentType: "application/json",
      type: validatedEvent.type,
      messageId: validatedEvent.eventId,
    },
  );

  await channel.waitForConfirms();
}
