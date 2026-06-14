import { Router } from "express";

import { getUrlStatsController } from "./click.controller.js";

export const clickRouter = Router();

clickRouter.get("/api/stats/:code", getUrlStatsController);
