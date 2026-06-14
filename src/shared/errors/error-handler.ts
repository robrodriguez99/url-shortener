import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
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

type ExpressBodyError = Error & {
  status?: unknown;
  type?: unknown;
};

function isExpressBodyError(
  error: unknown,
  type: string,
  status: number,
): error is ExpressBodyError {
  if (!(error instanceof Error)) {
    return false;
  }

  const bodyError = error as ExpressBodyError;

  return bodyError.type === type && bodyError.status === status;
}

export const notFoundHandler: RequestHandler = (
  _request,
  _response,
  next,
) => {
  next(
    new AppError({
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
      statusCode: 404,
    }),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request: Request,
  response: Response<ErrorResponse>,
  _next: NextFunction,
) => {
  void _next;
  const requestLogger = request.log ?? logger;

  if (isExpressBodyError(error, "entity.parse.failed", 400)) {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
      },
    });
    return;
  }

  if (isExpressBodyError(error, "entity.too.large", 413)) {
    response.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
      },
    });
    return;
  }

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
