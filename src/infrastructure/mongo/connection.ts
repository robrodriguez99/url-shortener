import mongoose from "mongoose";

import { logger } from "../../shared/logger/logger.js";
import { config } from "../config/env.js";

export async function connectMongo(): Promise<void> {
  if (
    mongoose.connection.readyState === mongoose.ConnectionStates.connected
  ) {
    return;
  }

  await mongoose.connect(config.mongodbUri, {
    serverSelectionTimeoutMS: 5_000,
  });

  logger.info("connected to MongoDB");
}

export async function disconnectMongo(): Promise<void> {
  if (
    mongoose.connection.readyState === mongoose.ConnectionStates.disconnected
  ) {
    return;
  }

  await mongoose.disconnect();
  logger.info("disconnected from MongoDB");
}
