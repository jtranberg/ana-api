import express from "express";
import type { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";

import { apartmentsFullFeed } from "./routes/feeds.js";
import { generateApartmentsFeedJob } from "./jobs/generateApartmentsFeedJob.js";
import { getCanonicalFromWebflow } from "./domain/normalize.js";
import { WebflowClient } from "./webflow/client.js";
import { generateApartmentsFull } from "./feeds/generateFeed.js";

dotenv.config();

// 🔥 Make crashes visible in Render logs
process.on("unhandledRejection", (reason) => {
  console.error("🔥 unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("🔥 uncaughtException:", err);
});

const app = express();

/* =========================================================
   CORS (Dashboard + local dev)
========================================================= */
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://wall-property-operations-platform.netlify.app",
  "https://wall-syndica.netlify.app",
]);

const isNetlifyPreview = (origin: string) => /^https:\/\/.*\.netlify\.app$/.test(origin);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/postman
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (isNetlifyPreview(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-admin-key",
      "x-feed-token",
    ],
    credentials: false,
  })
);
app.options("*", cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   Auth for feed/job/debug endpoints only
   (Dashboard endpoints do NOT need FEED_TOKEN)
========================================================= */
function requireFeedToken(req: Request, res: Response, next: NextFunction) {
  const headerToken = req.header("x-feed-token");

  const queryTokenRaw = req.query.token;
  const queryToken = Array.isArray(queryTokenRaw) ? queryTokenRaw[0] : queryTokenRaw;

  const token = headerToken || queryToken;

  if (!process.env.FEED_TOKEN) {
    return res.status(500).json({ error: "FEED_TOKEN not set" });
  }
  if (typeof token !== "string" || token !== process.env.FEED_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

/* =========================================================
   Health + Root
========================================================= */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "syndicator-ts", time: new Date().toISOString() });
});

// dashboard pings this
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "syndicator-ts" });
});

app.get("/", (_req, res) => {
  res.send("Syndicator is running. Try /health");
});

/* =========================================================
   Dashboard-compatible Runs API (minimal, in-memory)
   Your frontend expects:
   - GET  /api/runs
   - POST /api/run   { tenantId }
   - GET  /api/runs/:id  -> { run, issues, suggestions, exports }
========================================================= */
type RunStatus = "queued" | "running" | "succeeded" | "failed";

type Run = {
  _id: string;
  tenantId: string;
  status: RunStatus;
  createdAt: string;
  error?: string;
};

const runs: Run[] = [];

app.get("/api/runs", (_req, res) => {
  res.json(runs.slice().reverse());
});

app.get("/api/runs/:id", (req, res) => {
  const run = runs.find((r) => r._id === req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });

  // keep shape compatible with your RunDetail page
  res.json({
    run,
    issues: [],
    suggestions: [],
    exports: [],
  });
});

app.post("/api/run", async (req, res) => {
  const tenantId = String(req.body?.tenantId || "Wall");

  const run: Run = {
    _id: `${Date.now()}`,
    tenantId,
    status: "running",
    createdAt: new Date().toISOString(),
  };
  runs.push(run);

  try {
    // Trigger the real TS job directly (no FEED_TOKEN needed from browser)
    const result = await generateApartmentsFeedJob();

    run.status = "succeeded";
    return res.json({ ok: true, runId: run._id, result });
  } catch (err: any) {
    console.error("❌ /api/run failed:", err);
    run.status = "failed";
    run.error = err?.message || String(err);
    return res.status(500).json({ error: run.error, runId: run._id });
  }
});

/* =========================================================
   Feed + Job endpoints (protected)
========================================================= */

// 🔹 On-demand live feed (protected)
app.get("/feeds/apartments/full.xml", requireFeedToken, apartmentsFullFeed);

// 🔹 Manual job trigger (protected)
app.get("/jobs/generate-apartments", requireFeedToken, async (_req, res) => {
  try {
    const result = await generateApartmentsFeedJob();
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      error: "Job failed",
      message: err?.message || String(err),
    });
  }
});

/* =========================================================
   Debug endpoints (protected)
========================================================= */
app.get("/debug/webflow", requireFeedToken, async (_req, res) => {
  try {
    const data = await getCanonicalFromWebflow();
    res.json({
      properties: data.properties.length,
      floorplans: data.floorplans.length,
      units: data.units.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/debug/feed-blocked", requireFeedToken, async (_req, res) => {
  try {
    const data = await getCanonicalFromWebflow();
    const result = await generateApartmentsFull(data);

    res.json({
      recordCount: result.recordCount,
      blockedCount: result.blockedCount,
      blockedSample: result.blockedSample?.slice(0, 25) ?? [],
      canonicalUnitSample: data.units.slice(0, 3),
      canonicalPropertySample: data.properties.slice(0, 1),
      canonicalFloorplanSample: data.floorplans.slice(0, 2),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Units sample
app.get("/debug/webflow/units-sample", requireFeedToken, async (_req, res) => {
  try {
    const token = process.env.WEBFLOW_API_TOKEN!;
    const unitsId = process.env.WEBFLOW_COLLECTION_UNITS!;
    const client = new WebflowClient(token);

    const page = await client.fetchItemsPage(unitsId, 1, 0);
    const first = page.items?.[0];

    if (!first) return res.json({ itemsOnFirstPage: 0, note: "No items returned" });

    res.json({
      itemsOnFirstPage: page.items.length,
      firstItemId: first.id,
      fieldDataKeys: Object.keys(first.fieldData || {}),
      fieldDataSample: first.fieldData,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Properties sample
app.get("/debug/webflow/properties-sample", requireFeedToken, async (_req, res) => {
  try {
    const token = process.env.WEBFLOW_API_TOKEN!;
    const propsId = process.env.WEBFLOW_COLLECTION_PROPERTIES!;
    const client = new WebflowClient(token);

    const page = await client.fetchItemsPage(propsId, 1, 0);
    const first = page.items?.[0];

    if (!first) return res.json({ itemsOnFirstPage: 0, note: "No items returned" });

    res.json({
      itemsOnFirstPage: page.items.length,
      firstItemId: first.id,
      fieldDataKeys: Object.keys(first.fieldData || {}),
      fieldDataSample: first.fieldData,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Property by id (temporary: searches first 100)
app.get("/debug/webflow/property-by-id", requireFeedToken, async (req, res) => {
  try {
    const token = process.env.WEBFLOW_API_TOKEN!;
    const propsId = process.env.WEBFLOW_COLLECTION_PROPERTIES!;
    const client = new WebflowClient(token);

    const id = String(req.query.id || "");
    if (!id) return res.status(400).json({ error: "Missing ?id=" });

    const page = await client.fetchItemsPage(propsId, 100, 0);
    const match = page.items?.find((x) => x.id === id);

    if (!match) {
      return res.json({
        found: false,
        note: "Not found in first 100 properties.",
        samplePropertyIds: (page.items || []).slice(0, 10).map((x) => x.id),
      });
    }

    return res.json({
      found: true,
      id: match.id,
      fieldDataKeys: Object.keys(match.fieldData || {}),
      fieldDataSample: match.fieldData,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/debug/feed/blocked", requireFeedToken, async (_req, res) => {
  try {
    const data = await getCanonicalFromWebflow();
    const result = await generateApartmentsFull(data);

    res.json({
      recordCount: result.recordCount,
      blockedCount: result.blockedCount,
      blockedSample: result.blockedSample?.slice?.(0, 25) ?? [],
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================================================
   Start
========================================================= */
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Syndication server running on port ${PORT}`);
});