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
  originalUrl: z.url("originalUrl must be valid").refine(validateUrlProtocol, {
    message: "originalUrl must use HTTP or HTTPS",
  }),
  alias: shortUrlCodeSchema.optional(),
});

export type CreateUrlInput = z.infer<typeof createUrlSchema>;

function validateUrlProtocol(value: string): boolean {
  const protocol = new URL(value).protocol;

  return protocol === "http:" || protocol === "https:";
}
