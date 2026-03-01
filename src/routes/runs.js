import { Router } from "express";
import { z } from "zod";
import { Run } from "../models/Run.js";
import { Export } from "../models/Export.js";
import { Issue } from "../models/Issue.js";
import { Suggestion } from "../models/Suggestion.js";
import {
  triggerApartmentsJob,
  apartmentsFeedUrl,
} from "../services/syndicatorClient.js";
import { config } from "../config.js";

export const runsRouter = Router();

/**
 * POST /api/run
 * Creates a Run, triggers the Render syndicator job, stores an Export record, updates Run status.
 */
runsRouter.post("/run", async (req, res) => {
  const schema = z.object({
    tenantId: z.string().min(1).default("wallst"),
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const { tenantId } = parsed.data;

  const run = await Run.create({
    tenantId,
    status: "running",
  });

  try {
    // 1) Trigger the real Render syndicator job (token-protected)
    const jobResult = await triggerApartmentsJob();

    // 2) Store export URL (protected upstream; we'll proxy download via ana-api route below)
    const exp = await Export.create({
      runId: run._id,
      type: "xml",
      url: apartmentsFeedUrl(),
      filename: "apartments-full.xml",
    });

    // 3) Mark run succeeded
    run.status = "succeeded";
    run.finishedAt = new Date();
    run.syndicator = {
      job: jobResult,
      exportId: exp._id,
    };
    await run.save();

    return res.json({
      runId: run._id.toString(),
      syndicator: jobResult,
      export: { id: exp._id.toString(), type: exp.type },
    });
  } catch (e) {
    run.status = "failed";
    run.error = e?.message || String(e) || "Unknown error";
    run.finishedAt = new Date();
    await run.save();

    return res.status(500).json({ error: run.error, runId: run._id.toString() });
  }
});

/**
 * GET /api/runs
 */
runsRouter.get("/runs", async (_req, res) => {
  const runs = await Run.find().sort({ createdAt: -1 }).limit(50);
  return res.json(runs);
});

/**
 * GET /api/runs/:id
 */
runsRouter.get("/runs/:id", async (req, res) => {
  const run = await Run.findById(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });

  const [issues, suggestions, exports] = await Promise.all([
    Issue.find({ runId: run._id }).sort({ severity: -1, createdAt: -1 }),
    Suggestion.find({ runId: run._id }).sort({ createdAt: -1 }),
    Export.find({ runId: run._id }).sort({ createdAt: -1 }),
  ]);

  return res.json({ run, issues, suggestions, exports });
});

/**
 * GET /api/exports/:id/download
 * Proxies the protected syndicator XML download so the browser can download without exposing token.
 */
runsRouter.get("/exports/:id/download", async (req, res) => {
  const exp = await Export.findById(req.params.id);
  if (!exp) return res.status(404).json({ error: "Export not found" });

  const upstream = await fetch(exp.url, {
    method: "GET",
    headers: {
      "x-feed-token": config.syndicatorFeedToken || "",
    },
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return res.status(502).json({
      error: `Upstream export failed (${upstream.status})`,
      details: text || upstream.statusText,
    });
  }

  const filename = exp.filename || "export.xml";
  res.setHeader(
    "Content-Type",
    upstream.headers.get("content-type") || "application/octet-stream"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Stream/pipe would be ideal, but Buffer is fine for now
  const arrayBuffer = await upstream.arrayBuffer();
  return res.send(Buffer.from(arrayBuffer));
});
