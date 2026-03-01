// src/routes/importPropertiesCsv.js

import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { Run } from "../models/Run.js";
import { applyWebflowPropertiesUpdateOnly } from "../services/webflowPropertiesCsv.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^\w]/g, "");
}

function parseCsvOrThrow(fileBuffer) {
  const csvText = fileBuffer.toString("utf8");

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  if (parsed.errors?.length) {
    const err = new Error("CSV parse errors");
    err.details = parsed.errors.slice(0, 8);
    throw err;
  }

  const rows =
    (parsed.data || []).filter((r) =>
      Object.keys(r).some((k) => String(r[k] ?? "").trim())
    ) ?? [];

  const headers = rows.length ? Object.keys(rows[0]) : [];

  return { rows, headers };
}

/* =========================================================
   PREVIEW (no writes)
   POST /api/import/properties/csv
========================================================= */

router.post("/import/properties/csv", upload.single("file"), async (req, res) => {
  try {
    const tenantId = String(req.body.tenantId || "");
    const matchKey = req.body.matchKey || "item_id";

    if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const { rows, headers } = parseCsvOrThrow(req.file.buffer);

    return res.json({
      summary: {
        rows: rows.length,
        matchKey,
      },
      headers,
      preview: rows.slice(0, 10),
    });
  } catch (err) {
    return res.status(400).json({
      error: err?.message || "CSV preview failed",
      details: err?.details,
    });
  }
});

/* =========================================================
   APPLY (writes to Webflow)
   POST /api/import/properties/csv/apply
========================================================= */

router.post(
  "/import/properties/csv/apply",
  upload.single("file"),
  async (req, res) => {
    let run = null;

    try {
      const tenantId = String(req.body.tenantId || "");
      const matchKey = req.body.matchKey || "item_id";
      const dryRun = String(req.body.dryRun || "false") === "true";

      if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });
      if (!req.file) return res.status(400).json({ error: "Missing file" });

      const { rows, headers } = parseCsvOrThrow(req.file.buffer);

      run = await Run.create({
        tenantId,
        status: "running",
        startedAt: new Date(),
        config: {
          type: "properties-csv-import",
          matchKey,
          dryRun,
        },
      });

      if (dryRun) {
        return res.json({
          runId: run._id,
          summary: { rows: rows.length, matchKey },
          headers,
          preview: rows.slice(0, 10),
          applied: {
            dryRun: true,
            attempted: rows.length,
          },
        });
      }

      const applied = await applyWebflowPropertiesUpdateOnly({
        tenantId,
        matchKey,
        rows,
      });

      await Run.findByIdAndUpdate(run._id, {
        status: "succeeded",
        finishedAt: new Date(),
        stats: applied,
      });

      return res.json({
        runId: run._id,
        summary: { rows: rows.length, matchKey },
        headers,
        preview: rows.slice(0, 10),
        applied,
      });
    } catch (err) {
      if (run?._id) {
        await Run.findByIdAndUpdate(run._id, {
          status: "failed",
          finishedAt: new Date(),
          error: err?.message,
        });
      }

      return res.status(500).json({
        error: err?.message || "Apply failed",
      });
    }
  }
);

export const importPropertiesCsvRouter = router;