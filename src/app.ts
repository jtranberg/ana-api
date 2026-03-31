import express from "express";
import cors from "cors";
import { apartmentsFullFeed } from "./routes/feeds";
import livFeedRouter from "./routes/livFeed";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/feeds/apartments/full.xml", apartmentsFullFeed);
  app.use("/feeds", livFeedRouter);

  return app;
}