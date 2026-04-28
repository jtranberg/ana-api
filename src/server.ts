// src/server.ts (or index.ts)
// Best-practice refresh:
// - Centralized config + env validation
// - Safer CORS handling
// - Small helpers: asyncHandler, requestId, consistent errors
// - Runs API returns feed exports for all supported marketplaces
// - Feed endpoints support ?available=true and optional ?download=1 for filename
// - External marketplace feeds use Basic Auth
// - Internal jobs/debug endpoints remain protected with FEED_TOKEN
// - Dashboard-safe XML route can still be added separately if needed

import express from "express";
import type { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";

import { getCanonicalFromWebflow } from "./domain/normalize.js";
import { buildApartmentsMitsFeed } from "./feeds/buildApartmentsMitsFeed.js";
import { generateApartmentsFeedJob } from "./jobs/generateApartmentsFeedJob.js";
import { generateRentalsCaFeed } from "./lib/generateRentalsCaFeed";
import { generateZillowFeed } from "./lib/generateZillowFeed";
import { generateZumperFeed } from "./lib/generateZumperFeed";
import importRoutes from "./routes/import.routes.js";
import webflowPropertiesRoutes from "./routes/webflowPropertiesRouter.js";
import webflowUnitsRouter from "./routes/webflowUnitsRouter.js";
import { WebflowClient } from "./webflow/client.js";

// import { generateApartmentsFull } from "./feeds/generateFeed.js";
// import importProxyRoutes from "./routes/importProxy.routes.js";

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

const FEED_TOKEN = process.env.FEED_TOKEN || "";
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || "";

const FEED_BASIC_USER = process.env.FEED_BASIC_USER || "";
const FEED_BASIC_PASS = process.env.FEED_BASIC_PASS || "";

/**
 * Smart available window:
 * Include units explicitly marked available, even if the available date
 * is in the near future. This keeps "available soon" inventory in feeds.
 */
const FUTURE_AVAILABLE_WINDOW_DAYS = 120;

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://document-portal.netlify.app",
  "https://mailroom-portal.netlify.app",
  "https://wall-property-operations-platform.netlify.app",
]);

const isNetlifyPreview = (origin: string) => /^https:\/\/.*\.netlify\.app$/.test(origin);

/* =========================================================
   App + Middleware
========================================================= */
const app = express();

app.use((req, _res, next) => {
  (req as any).rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
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
      "x-dashboard-token",
    ],
    credentials: false,
    maxAge: 86400,
  })
);
app.options(/.*/, cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", importRoutes);
app.use("/api/webflow", webflowPropertiesRoutes);
app.use("/api/webflow", webflowUnitsRouter);

// app.use("/api", importProxyRoutes);

/* =========================================================
   Helpers
========================================================= */
type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<any>;

const asyncHandler =
  (fn: AsyncRoute) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function qBool(v: unknown) {
  const s = String(v ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function requireBasicFeedAuth(req: Request, res: Response, next: NextFunction) {
  if (!FEED_BASIC_USER || !FEED_BASIC_PASS) {
    return res.status(500).json({ error: "Basic feed auth not configured" });
  }

  const auth = req.header("authorization");

  if (!auth || !auth.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Syndication Feed"');
    return res.status(401).send("Authentication required");
  }

  const encoded = auth.slice("Basic ".length).trim();
  let decoded = "";

  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return res.status(401).send("Invalid authorization header");
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return res.status(401).send("Invalid authorization format");
  }

  const incomingUser = decoded.slice(0, separatorIndex);
  const incomingPass = decoded.slice(separatorIndex + 1);

  if (incomingUser !== FEED_BASIC_USER || incomingPass !== FEED_BASIC_PASS) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Syndication Feed"');
    return res.status(401).send("Unauthorized");
  }

  return next();
}

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

function requireFeedToken(req: Request, res: Response, next: NextFunction) {
  const headerToken = req.header("x-feed-token");
  const queryTokenRaw = req.query.token;
  const queryToken = Array.isArray(queryTokenRaw) ? queryTokenRaw[0] : queryTokenRaw;

  const token = headerToken || queryToken;

  if (!FEED_TOKEN) {
    return res.status(500).json({ error: "FEED_TOKEN not set" });
  }

  if (typeof token !== "string" || token !== FEED_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

function filterCanonicalAvailableOnly<T extends { units: any[] }>(data: T) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + FUTURE_AVAILABLE_WINDOW_DAYS);

  return {
    ...data,
    units: (data.units || []).filter((u: any) => {
      const available =
  u?.available === true ||
  u?.available === "true" ||
  u?.available === 1 ||
  u?.available === "1";
      if (!available) return false;

      const dRaw = u?.availableDate;
      if (!dRaw) return true;

      const d = new Date(dRaw);
      if (!Number.isFinite(d.getTime())) return true;

      d.setHours(0, 0, 0, 0);
      return d.getTime() <= cutoff.getTime();
    }),
  };
}

/* =========================================================
   Health + Root
========================================================= */
app.get("/", (_req, res) => {
  res.send("Syndicator is running. Try /health");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "syndicator-ts" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "syndicator-ts", time: new Date().toISOString() });
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

  return res.json({
    run,
    issues: [],
    suggestions: [],
    exports: [
      {
        id: "apartments_available_xml",
        label: "Apartments.com Available Feed",
        format: "xml",
        auth: "basic",
        endpoint: "/feeds/apartments/full.xml?available=true",
        url: "/feeds/apartments/full.xml?available=true",
      },
      {
        id: "apartments_full_xml",
        label: "Apartments.com Full Feed",
        format: "xml",
        auth: "basic",
        endpoint: "/feeds/apartments/full.xml",
        url: "/feeds/apartments/full.xml",
      },
      {
        id: "rentals_ca_available_json",
        label: "Rentals.ca Available Feed",
        format: "json",
        auth: "basic",
        endpoint: "/feeds/rentals-ca.json?available=true",
        url: "/feeds/rentals-ca.json?available=true",
      },
      {
        id: "rentals_ca_full_json",
        label: "Rentals.ca Full Feed",
        format: "json",
        auth: "basic",
        endpoint: "/feeds/rentals-ca.json",
        url: "/feeds/rentals-ca.json",
      },
      {
        id: "zillow_available_json",
        label: "Zillow Available Feed",
        format: "json",
        auth: "basic",
        endpoint: "/feeds/zillow.json?available=true",
        url: "/feeds/zillow.json?available=true",
      },
      {
        id: "zillow_full_json",
        label: "Zillow Full Feed",
        format: "json",
        auth: "basic",
        endpoint: "/feeds/zillow.json",
        url: "/feeds/zillow.json",
      },
      {
        id: "zumper_available_json",
        label: "Zumper Available Feed",
        format: "json",
        auth: "basic",
        endpoint: "/feeds/zumper.json?available=true",
        url: "/feeds/zumper.json?available=true",
      },
      {
        id: "zumper_full_json",
        label: "Zumper Full Feed",
        format: "json",
        auth: "basic",
        endpoint: "/feeds/zumper.json",
        url: "/feeds/zumper.json",
      },
    ],
  });
});

import { buildLivRentFeed } from "./feeds/buildLivRentFeed.js";

app.get(
  "/feeds/liv-rent.xml",
  requireBasicFeedAuth,
  asyncHandler(async (req, res) => {
    const availableOnly = qBool(req.query.available);

    const canonical = await getCanonicalFromWebflow();
    const filtered = availableOnly ? filterCanonicalAvailableOnly(canonical as any) : canonical;

    const result = buildLivRentFeed(filtered as any);

    res.setHeader("Content-Type", "application/xml; charset=utf-8");

    if (qBool(req.query.download)) {
      const filename = availableOnly ? "liv_rent_available.xml" : "liv_rent_full.xml";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }

    return res.status(200).send(result.xml);
  })
);

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
   Debug endpoints (protected with FEED_TOKEN)
   Alphabetical
========================================================= */
app.get("/debug/env", requireFeedToken, (_req, res) => {
  const mask = (v?: string) => (v ? v.slice(0, 6) + "…" + v.slice(-6) : null);

  res.json({
    WEBFLOW_COLLECTION_UNITS: mask(process.env.WEBFLOW_COLLECTION_UNITS),
    WEBFLOW_COLLECTION_PROPERTIES: mask(process.env.WEBFLOW_COLLECTION_PROPERTIES),
    WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN ? "set" : "missing",
    FEED_BASIC_PASS: FEED_BASIC_PASS ? "set" : "missing",
    FEED_BASIC_USER: FEED_BASIC_USER ? "set" : "missing",
    FEED_TOKEN: FEED_TOKEN ? "set" : "missing",
    DASHBOARD_TOKEN: DASHBOARD_TOKEN ? "set" : "missing",
  });
});

app.get(
  "/debug/feed-blocked",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const data = await getCanonicalFromWebflow();
    const result = buildApartmentsMitsFeed(data as any);

    res.json({
      recordCount: result.recordCount,
      blockedCount: result.blockedCount,
      blockedSample: result.blockedSample?.slice(0, 25) ?? [],
      canonicalUnitSample: data.units.slice(0, 3),
      canonicalPropertySample: data.properties.slice(0, 1),
      canonicalFloorplanSample: data.floorplans.slice(0, 2),
    });
  })
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
  "/debug/webflow/properties-sample",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const token = process.env.WEBFLOW_API_TOKEN!;
    const propsId = process.env.WEBFLOW_COLLECTION_PROPERTIES!;
    const client = new WebflowClient(token);

    const page = await client.fetchItemsPage(propsId, 1, 0);
    const first = page.items?.[0];

    if (!first) {
      return res.json({ itemsOnFirstPage: 0, note: "No items returned" });
    }

    return res.json({
      itemsOnFirstPage: page.items.length,
      firstItemId: first.id,
      fieldDataKeys: Object.keys(first.fieldData || {}),
      fieldDataSample: first.fieldData,
    });
  })
);

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

app.get(
  "/debug/webflow/units-sample",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const token = process.env.WEBFLOW_API_TOKEN!;
    const unitsId = process.env.WEBFLOW_COLLECTION_UNITS!;
    const client = new WebflowClient(token);

    const page = await client.fetchItemsPage(unitsId, 1, 0);
    const first = page.items?.[0];

    if (!first) {
      return res.json({ itemsOnFirstPage: 0, note: "No items returned" });
    }

    return res.json({
      itemsOnFirstPage: page.items.length,
      firstItemId: first.id,
      fieldDataKeys: Object.keys(first.fieldData || {}),
      fieldDataSample: first.fieldData,
    });
  })
);

/* =========================================================
   Marketplace feed endpoints (Basic Auth)
   Alphabetical
========================================================= */

/* -------------------------
   Apartments.com XML feed
------------------------- */
app.get(
  "/feeds/apartments/full.xml",
  requireBasicFeedAuth,
  asyncHandler(async (req, res) => {
    console.log("📡 Apartments.com FEED HIT", {
      time: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      availableOnly: req.query.available,
    });

    const availableOnly = qBool(req.query.available);

    const data = await getCanonicalFromWebflow();
    const filtered = availableOnly ? filterCanonicalAvailableOnly(data as any) : data;

    const result = buildApartmentsMitsFeed(filtered as any, {
      availableOnly,
    });

    console.log("✅ Apartments.com FEED SERVED", {
      time: new Date().toISOString(),
      recordCount: result.recordCount,
      blockedCount: result.blockedCount,
    });

    const xml = result.xml;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");

    if (qBool(req.query.download)) {
      const filename = availableOnly ? "apartments_available.xml" : "apartments_full.xml";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }

    return res.status(200).send(xml);
  })
);

/* -------------------------
   Rentals.ca JSON feed
------------------------- */
app.get(
  "/feeds/rentals-ca.json",
  requireBasicFeedAuth,
  asyncHandler(async (req, res) => {
    const availableOnly = qBool(req.query.available);

    const canonical = await getCanonicalFromWebflow();
    const feed = generateRentalsCaFeed(canonical, {
      availableOnly,
      siteBaseUrl: process.env.SITE_BASE_URL,
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (qBool(req.query.download)) {
      const filename = availableOnly ? "rentals_ca_available.json" : "rentals_ca_full.json";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }

    return res.status(200).json(feed);
  })
);

/* -------------------------
   Zillow JSON feed
------------------------- */
app.get(
  "/feeds/zillow.json",
  requireBasicFeedAuth,
  asyncHandler(async (req, res) => {
    const availableOnly = qBool(req.query.available);

    const canonical = await getCanonicalFromWebflow();
    const feed = generateZillowFeed(canonical, {
      availableOnly,
      siteBaseUrl: process.env.SITE_BASE_URL,
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (qBool(req.query.download)) {
      const filename = availableOnly ? "zillow_available.json" : "zillow_full.json";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }

    return res.status(200).json(feed);
  })
);

/* -------------------------
   Zumper JSON feed
------------------------- */
app.get(
  "/feeds/zumper.json",
  requireBasicFeedAuth,
  asyncHandler(async (req, res) => {
    const availableOnly = qBool(req.query.available);

    const canonical = await getCanonicalFromWebflow();
    const feed = generateZumperFeed(canonical, { availableOnly });

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (qBool(req.query.download)) {
      const filename = availableOnly ? "zumper_available.json" : "zumper_full.json";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }

    return res.status(200).json(feed);
  })
);

/* =========================================================
   Internal job endpoints (FEED_TOKEN)
========================================================= */
app.get(
  "/jobs/generate-apartments",
  requireFeedToken,
  asyncHandler(async (_req, res) => {
    const result = await generateApartmentsFeedJob();
    return res.json(result);
  })
);

/* =========================================================
   Optional dashboard-safe endpoints
========================================================= */
// app.get(
//   "/dashboard/feeds/apartments/full.xml",
//   requireDashboardTokenIfConfigured,
//   asyncHandler(async (req, res) => {
//     const availableOnly = qBool(req.query.available);
//
//     const data = await getCanonicalFromWebflow();
//     const filtered = availableOnly ? filterCanonicalAvailableOnly(data as any) : data;
//
//     const result = await generateApartmentsFull(filtered as any);
//     const xml = (result as any).xml ?? (result as any).content ?? result;
//
//     res.setHeader("Content-Type", "application/xml; charset=utf-8");
//     return res.status(200).send(xml);
//   })
// );

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