import { randomUUID } from "node:crypto";

import { pinoHttp } from "pino-http";

import { logger } from "./logger.js";

export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (request) => request.url === "/health",
  },
  genReqId: (request, response) => {
    const incomingRequestId = request.headers["x-request-id"];
    const requestId =
      typeof incomingRequestId === "string" ? incomingRequestId : randomUUID();

    response.setHeader("x-request-id", requestId);

    return requestId;
  },
  customLogLevel: (_request, response, error) => {
    if (error !== undefined || response.statusCode >= 500) {
      return "error";
    }

    if (response.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },
});
