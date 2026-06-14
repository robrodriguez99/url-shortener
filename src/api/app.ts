import express from "express";

import { urlRouter } from "../modules/urls/url.routes.js";
import { errorHandler } from "../shared/errors/error-handler.js";
import { httpLogger } from "../shared/logger/http-logger.js";

export function createApp() {
  const app = express();

  app.use(httpLogger);
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use(urlRouter);

  // Error middleware must be registered after routes.
  app.use(errorHandler);

  return app;
}
