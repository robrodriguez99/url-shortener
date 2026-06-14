import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { errorHandler } from "../src/shared/errors/error-handler.js";
import { AppError } from "../src/shared/errors/app-error.js";

describe("errorHandler", () => {
  it("serializes application errors consistently", async () => {
    const app = express();

    app.get("/failure", () => {
      throw new AppError({
        code: "TEST_CONFLICT",
        message: "Test conflict",
        statusCode: 409,
      });
    });
    app.use(errorHandler);

    const response = await request(app).get("/failure");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "TEST_CONFLICT",
        message: "Test conflict",
      },
    });
  });

  it("serializes Zod errors as validation errors", async () => {
    const app = express();

    app.get("/failure", () => {
      z.object({ code: z.string() }).parse({});
    });
    app.use(errorHandler);

    const response = await request(app).get("/failure");
    const body = response.body as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([
      {
        path: "code",
        message: "Invalid input: expected string, received undefined",
      },
    ]);
  });
});

type ErrorResponseBody = {
  error: {
    code: string;
    details?: Array<{
      path?: string;
      message: string;
    }>;
  };
};
