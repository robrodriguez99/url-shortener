import { z } from "zod";

const clickCodeSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const tinyUrlAccessedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("tinyurl.accessed.v1"),
  occurredAt: z.iso.datetime(),
  data: z.object({
    code: clickCodeSchema,
    ip: z.string().min(1).max(45).optional(),
    userAgent: z.string().min(1).max(1_024).optional(),
  }),
});

export type TinyUrlAccessedEvent = z.infer<
  typeof tinyUrlAccessedEventSchema
>;
