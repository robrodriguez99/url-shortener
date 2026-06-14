import { z } from "zod";

export const shortUrlCodeSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message:
      "code must contain only letters, numbers, hyphens, or underscores",
  });

export const createUrlSchema = z.object({
  originalUrl: z.url({
    protocol: /^https?$/,
    error: "originalUrl must be a valid HTTP or HTTPS URL",
  }),
  alias: shortUrlCodeSchema.optional(),
});

export type CreateUrlInput = z.infer<typeof createUrlSchema>;
