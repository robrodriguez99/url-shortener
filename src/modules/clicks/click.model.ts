import { model, Schema } from "mongoose";

export type ClickEvent = {
  eventId: string;
  code: string;
  occurredAt: Date;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
};

const clickEventSchema = new Schema<ClickEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    collection: "click_events",
    timestamps: true,
  },
);

clickEventSchema.index({ code: 1, occurredAt: -1 });

export const ClickEventModel = model<ClickEvent>(
  "ClickEvent",
  clickEventSchema,
);
