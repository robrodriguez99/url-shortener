import { z } from "zod";

const RESERVED_SHORT_URL_CODES = new Set(["health"]);

export const shortUrlCodeSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message:
      "code must contain only letters, numbers, hyphens, or underscores",
  });

const shortUrlAliasSchema = shortUrlCodeSchema.refine(
  (alias) => !RESERVED_SHORT_URL_CODES.has(alias.toLowerCase()),
  {
    message: "alias is reserved by the application",
  },
);

export const createUrlSchema = z.object({
  originalUrl: z.url({
    protocol: /^https?$/,
    error: "originalUrl must be a valid HTTP or HTTPS URL",
  }),
  alias: shortUrlAliasSchema.optional(),
});

export type CreateUrlInput = z.infer<typeof createUrlSchema>;
