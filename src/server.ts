// src/server.ts (or index.ts)
// Best-practice refresh:
// - Centralized config + env validation
// - Safer CORS handling
// - Small helpers: asyncHandler, requestId, consistent errors
// - Runs API returns BOTH Full + Available exports
// - XML endpoints support ?available=true and (optionally) ?download=1 for filename
// - Feed endpoints remain protected with FEED_TOKEN (header OR ?token=...)
// - Dashboard XML endpoint is "dashboard-safe" (no FEED_TOKEN) but can be locked with DASHBOARD_TOKEN if you want

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

/* =========================================================
   Process safety (Render logs)
========================================================= */
process.on("unhandledRejection", (reason) => console.error("🔥 unhandledRejection:", reason));
process.on("uncaughtException", (err) => console.error("🔥 uncaughtException:", err));

/* =========================================================
   Config
========================================================= */
const PORT = Number(process.env.PORT || 3000);
const FEED_TOKEN = process.env.FEED_TOKEN || ""; // used for /feeds + /jobs + /debug (and optionally dashboard)
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || ""; // optional: if set, require for /api/feeds/*

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://wall-property-operations-platform.netlify.app",
  "https://mailroom-portal.netlify.app",
  "https://document-portal.netlify.app",
]);

const isNetlifyPreview = (origin: string) => /^https:\/\/.*\.netlify\.app$/.test(origin);

/* =========================================================
   App + Middleware
========================================================= */
const app = express();

// Basic request id (helps when scanning logs)
app.use((req, _res, next) => {
  (req as any).rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

// CORS (dashboard + dev)
app.use(
  cors({
    origin: (origin, cb) => {
      // allow curl/postman/no-origin calls
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (isNetlifyPreview(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-admin-key", "x-feed-token", "x-dashboard-token"],
    credentials: false,
    maxAge: 86400,
  })
);
app.options("*", cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   Helpers
========================================================= */
type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<any>;
const asyncHandler =
  (fn: AsyncRoute) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function requireFeedToken(req: Request, res: Response, next: NextFunction) {
  const headerToken = req.header("x-feed-token");
  const queryTokenRaw = req.query.token;
  const queryToken = Array.isArray(queryTokenRaw) ? queryTokenRaw[0] : queryTokenRaw;

  const token = headerToken || queryToken;

  if (!FEED_TOKEN) return res.status(500).json({ error: "FEED_TOKEN not set" });
  if (typeof token !== "string" || token !== FEED_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  return next();
}

// Optional: lock dashboard downloads if you want
function requireDashboardTokenIfConfigured(req: Request, res: Response, next: NextFunction) {
  if (!DASHBOARD_TOKEN) return next();

  const headerToken = req.header("x-dashboard-token");
  const queryTokenRaw = req.query.dt;
  const queryToken = Array.isArray(queryTokenRaw) ? queryTokenRaw[0] : queryTokenRaw;

  const token = headerToken || queryToken;

  if (typeof token !== "string" || token !== DASHBOARD_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

// normalize bool query
function qBool(v: unknown) {
  const s = String(v ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

// "Available only" filter (adjust keys if your canonical differs)
function filterCanonicalAvailableOnly<T extends { units: any[] }>(data: T) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    ...data,
    units: (data.units || []).filter((u: any) => {
      const available = Boolean(u?.available);
      if (!available) return false;

      // optional date logic
      const dRaw = u?.availableDate;
      if (!dRaw) return true;

      const d = new Date(dRaw);
      if (!Number.isFinite(d.getTime())) return true;

      d.setHours(0, 0, 0, 0);
      return d.getTime() <= today.getTime();
    }),
  };
}

/* =========================================================
   Health + Root
========================================================= */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "syndicator-ts", time: new Date().toISOString() });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "syndicator-ts" });
});

app.get("/", (_req, res) => {
  res.send("Syndicator is running. Try /health");
});

/* =========================================================
   Runs API (frontend-compatible, in-memory)
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

  // exports include BOTH full + available feed downloads
  return res.json({
    run,
    issues: [],
    suggestions: [],
    exports: [
      {
        id: "apartments_full_xml",
        label: "Download FULL Apartments XML",
        format: "xml",
        url: "/api/feeds/apartments/full.xml",
      },
      {
        id: "apartments_available_xml",
        label: "Download AVAILABLE Apartments XML",
        format: "xml",
        url: "/api/feeds/apartments/full.xml?available=true",
      },
    ],
  });
});

app.post(
  "/api/run",
  asyncHandler(async (req, res) => {
    const tenantId = String(req.body?.tenantId || "Wall");

    const run: Run = {
      _id: `${Date.now()}`,
      tenantId,
      status: "running",
      createdAt: new Date().toISOString(),
    };
    runs.push(run);

    try {
      // Dashboard trigger: no FEED_TOKEN needed
      const result = await generateApartmentsFeedJob();
      run.status = "succeeded";
      return res.json({ ok: true, runId: run._id, result });
    } catch (err: any) {
      console.error("❌ /api/run failed:", err);
      run.status = "failed";
      run.error = err?.message || String(err);
      return res.status(500).json({ error: run.error, runId: run._id });
    }
  })
);

/* =========================================================
   Dashboard-safe XML download (no FEED_TOKEN)
   - Optional lock via DASHBOARD_TOKEN (header x-dashboard-token OR ?dt=)
   - Supports ?available=true
========================================================= */
app.get(
  "/api/feeds/apartments/full.xml",
  requireDashboardTokenIfConfigured,
  asyncHandler(async (req, res) => {
    const onlyAvailable = qBool(req.query.available);

    const data = await getCanonicalFromWebflow();
    const filtered = onlyAvailable ? filterCanonicalAvailableOnly(data as any) : data;

    const result = await generateApartmentsFull(filtered as any);
    const xml = (result as any).xml ?? (result as any).content ?? (result as any);

    res.setHeader("Content-Type", "application/xml; charset=utf-8");

    // If you want “download” behavior, keep content-disposition; otherwise you can remove this.
    const filename = onlyAvailable ? "apartments_available.xml" : "apartments_full.xml";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.status(200).send(xml);
  })
);

/* =========================================================
   Feed + Job endpoints (protected with FEED_TOKEN)
   These are the endpoints you typically hand to Apartments.com.
   If they can only fetch URLs (no custom headers), use ?token=...
========================================================= */
app.get("/feeds/apartments/full.xml", requireFeedToken, apartmentsFullFeed);

app.get(
  "/jobs/generate-apartments",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const result = await generateApartmentsFeedJob();
    return res.json(result);
  })
);

/* =========================================================
   Debug endpoints (protected)
========================================================= */
app.get(
  "/debug/env",
  requireFeedToken,
  (_req, res) => {
    const mask = (v?: string) => (v ? v.slice(0, 6) + "…" + v.slice(-6) : null);
    res.json({
      WEBFLOW_COLLECTION_UNITS: mask(process.env.WEBFLOW_COLLECTION_UNITS),
      WEBFLOW_COLLECTION_PROPERTIES: mask(process.env.WEBFLOW_COLLECTION_PROPERTIES),
      WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN ? "set" : "missing",
    });
  }
);

app.get(
  "/debug/webflow",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const data = await getCanonicalFromWebflow();
    res.json({
      properties: data.properties.length,
      floorplans: data.floorplans.length,
      units: data.units.length,
    });
  })
);

app.get(
  "/debug/feed-blocked",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const data = await getCanonicalFromWebflow();
    const result = await generateApartmentsFull(data as any);

    res.json({
      recordCount: (result as any).recordCount,
      blockedCount: (result as any).blockedCount,
      blockedSample: (result as any).blockedSample?.slice(0, 25) ?? [],
      canonicalUnitSample: data.units.slice(0, 3),
      canonicalPropertySample: data.properties.slice(0, 1),
      canonicalFloorplanSample: data.floorplans.slice(0, 2),
    });
  })
);

// Units sample
app.get(
  "/debug/webflow/units-sample",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const token = process.env.WEBFLOW_API_TOKEN!;
    const unitsId = process.env.WEBFLOW_COLLECTION_UNITS!;
    const client = new WebflowClient(token);

    const page = await client.fetchItemsPage(unitsId, 1, 0);
    const first = page.items?.[0];
    if (!first) return res.json({ itemsOnFirstPage: 0, note: "No items returned" });

    return res.json({
      itemsOnFirstPage: page.items.length,
      firstItemId: first.id,
      fieldDataKeys: Object.keys(first.fieldData || {}),
      fieldDataSample: first.fieldData,
    });
  })
);

// Properties sample
app.get(
  "/debug/webflow/properties-sample",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const token = process.env.WEBFLOW_API_TOKEN!;
    const propsId = process.env.WEBFLOW_COLLECTION_PROPERTIES!;
    const client = new WebflowClient(token);

    const page = await client.fetchItemsPage(propsId, 1, 0);
    const first = page.items?.[0];
    if (!first) return res.json({ itemsOnFirstPage: 0, note: "No items returned" });

    return res.json({
      itemsOnFirstPage: page.items.length,
      firstItemId: first.id,
      fieldDataKeys: Object.keys(first.fieldData || {}),
      fieldDataSample: first.fieldData,
    });
  })
);

// Property by id (temporary: searches first 100)
app.get(
  "/debug/webflow/property-by-id",
  requireFeedToken,
  asyncHandler(async (req, res) => {
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
  })
);

/* =========================================================
   Central error handler (last)
========================================================= */
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const rid = (req as any).rid;
  console.error(`❌ [${rid}]`, err);

  const status = Number(err?.status || 500);
  const message = err?.message || "Server error";

  res.status(status).json({
    error: message,
    requestId: rid,
  });
});

/* =========================================================
   Start
========================================================= */
app.listen(PORT, () => {
  console.log(`Syndication server running on port ${PORT}`);
});