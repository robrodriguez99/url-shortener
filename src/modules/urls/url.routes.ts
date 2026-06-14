import { Router } from "express";

import {
  createUrlController,
  resolveUrlController,
} from "./url.controller.js";

export const urlRouter = Router();

urlRouter.post("/api/urls", createUrlController);
urlRouter.get("/:code", resolveUrlController);
