import { mongo } from "mongoose";

import { ClickEventModel } from "./click.model.js";
import type { TinyUrlAccessedEvent } from "./click.schemas.js";

export type SaveClickEventResult = "created" | "duplicate";

export async function saveClickEvent(
  event: TinyUrlAccessedEvent,
): Promise<SaveClickEventResult> {
  try {
    await ClickEventModel.create({
      eventId: event.eventId,
      code: event.data.code,
      occurredAt: new Date(event.occurredAt),
      ...(event.data.ip === undefined ? {} : { ip: event.data.ip }),
      ...(event.data.userAgent === undefined
        ? {}
        : { userAgent: event.data.userAgent }),
    });

    return "created";
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 11_000) {
      return "duplicate";
    }

    throw error;
  }
}
