import dotenv from "dotenv";
import path from "node:path";

/* =========================================================
   Load .env in development only
========================================================= */
if (process.env.NODE_ENV !== "production") {
  const envPath = path.resolve(process.cwd(), ".env");
  dotenv.config({ path: envPath });

  console.log("=== CONFIG DEBUG ===");
  console.log("Working Directory:", process.cwd());
  console.log("Loading .env from:", envPath);
  console.log("MONGO_URI:", process.env.MONGO_URI);
  console.log("====================");
}

/* =========================================================
   Config Types
========================================================= */

export interface AppConfig {
  port: number;
  mongoUri?: string;

  syndicatorFeedToken: string | null;
  syndicatorBaseUrl?: string;
  syndicatorApiKey: string | null;

  awsRegion: string;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
}

/* =========================================================
   Config Object
========================================================= */

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 3001),

  mongoUri: process.env.MONGO_URI,

  syndicatorFeedToken: process.env.SYNDICATOR_FEED_TOKEN ?? null,
  syndicatorBaseUrl: process.env.SYNDICATOR_BASE_URL,
  syndicatorApiKey: process.env.SYNDICATOR_API_KEY ?? null,

  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? null,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? null,
};