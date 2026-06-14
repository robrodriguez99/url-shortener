import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import { ZodError } from "zod";

import { logger } from "../logger/logger.js";
import { AppError, type ErrorDetails } from "./app-error.js";

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: ErrorDetails;
  };
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request: Request,
  response: Response<ErrorResponse>,
  _next: NextFunction,
) => {
  void _next;
  const requestLogger = request.log ?? logger;

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      requestLogger.error(
        { err: error, errorCode: error.code },
        "application error",
      );
    }

    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  requestLogger.error({ err: error }, "unexpected request error");
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
