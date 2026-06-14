import { model, Schema } from "mongoose";

export type ShortUrl = {
  code: string;
  originalUrl: string;
  createdAt: Date;
  updatedAt: Date;
};

const shortUrlSchema = new Schema<ShortUrl>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
    },
    originalUrl: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const ShortUrlModel = model<ShortUrl>("ShortUrl", shortUrlSchema);
