import express from "express";
import multer from "multer";
import Papa from "papaparse";
import { Run } from "../models/Run.js";
import { applyWebflowUnitsUpdateOnly } from "../services/webflowUnits.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Small helper: safely read fields whether body is parsed or not
function bodyField(req, key, fallback = "") {
  // multer populates req.body for multipart/form-data,
  // express.json/urlencoded populate req.body for JSON/forms.
  const v = req?.body?.[key];
  if (v === undefined || v === null) return fallback;
  return v;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^\w]/g, "");
}

function coerceValue(v) {
  const s = String(v ?? "").trim();
  if (s === "") return "";

  const n = Number(s);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(s)) return n;

  return s;
}

function coerceRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = coerceValue(v);
  return out;
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

  const rowsRaw =
    (parsed.data || []).filter((r) =>
      Object.keys(r).some((k) => String(r[k] ?? "").trim())
    ) ?? [];

  const rows = rowsRaw.map(coerceRow);
  const headers = rows.length ? Object.keys(rows[0]) : [];

  return { rows, headers };
}

function validateRows(rows, matchKey) {
  const invalidRows = [];
  if (!matchKey) return invalidRows;

  rows.forEach((r, idx) => {
    if (!r[matchKey] || String(r[matchKey]).trim() === "") {
      invalidRows.push({
        row: idx + 2,
        reason: `Missing required column: ${matchKey}`,
      });
    }
  });

  return invalidRows;
}

// ✅ PREVIEW route (always returns preview)
router.post("/import/csv", upload.single("file"), async (req, res) => {
  try {
    const tenantId = String(bodyField(req, "tenantId", "")).trim();
    const dryRun = String(bodyField(req, "dryRun", "true")) === "true";
    const mode = bodyField(req, "mode", "update-only") === "upsert" ? "upsert" : "update-only";
    const matchKeyRaw = bodyField(req, "matchKey", null);
    const matchKey = matchKeyRaw ? normalizeHeader(matchKeyRaw) : null;

    if (!tenantId) {
      return res.status(400).json({
        error: "Missing tenantId",
        hint: "Send as multipart field: -F \"tenantId=...\"",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        error: "Missing file",
        hint: "Upload CSV as multipart field named 'file': -F \"file=@path.csv\"",
      });
    }

    const { rows, headers } = parseCsvOrThrow(req.file.buffer);
    const invalidRows = validateRows(rows, matchKey);

    const summary = {
      rows: rows.length,
      headers: headers.length,
      mode,
      dryRun,
      matchKey,
      valid: matchKey ? rows.length - invalidRows.length : rows.length,
      errors: invalidRows.length,
    };

    return res.json({
      summary,
      headers,
      invalidRows: invalidRows.slice(0, 50),
      preview: rows.slice(0, 10),
    });
  } catch (err) {
    // CSV issues are a 400 (bad input), not 500
    return res.status(400).json({
      error: err?.message || "CSV preview failed",
      details: err?.details,
    });
  }
});

// ✅ APPLY route (writes + returns preview + applied stats)
router.post("/import/csv/apply", upload.single("file"), async (req, res) => {
  let run = null;

  try {
    const tenantId = String(bodyField(req, "tenantId", "")).trim();
    const mode = bodyField(req, "mode", "update-only") === "upsert" ? "upsert" : "update-only";
    const dryRun = String(bodyField(req, "dryRun", "false")) === "true";
    const matchKeyRaw = bodyField(req, "matchKey", null);
    const matchKey = matchKeyRaw ? normalizeHeader(matchKeyRaw) : null;

    if (!tenantId) {
      return res.status(400).json({
        error: "Missing tenantId",
        hint: "Send as multipart field: -F \"tenantId=...\"",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        error: "Missing file",
        hint: "Upload CSV as multipart field named 'file': -F \"file=@path.csv\"",
      });
    }

    if (!matchKey) {
      return res.status(400).json({
        error: "Missing matchKey",
        hint: "Send as multipart field: -F \"matchKey=slug\" (or whichever column you match on)",
      });
    }

    const { rows, headers } = parseCsvOrThrow(req.file.buffer);
    const invalidRows = validateRows(rows, matchKey);

    const summary = {
      rows: rows.length,
      headers: headers.length,
      mode,
      dryRun,
      matchKey,
      valid: rows.length - invalidRows.length,
      errors: invalidRows.length,
    };

    if (invalidRows.length) {
      return res.status(400).json({
        error: "Validation failed",
        summary,
        headers,
        invalidRows: invalidRows.slice(0, 50),
        preview: rows.slice(0, 10),
      });
    }

    // ✅ Audit Run record
    run = await Run.create({
      tenantId,
      status: "running",
      startedAt: new Date(),
      config: { type: "csv-import", mode, dryRun, matchKey },
    });

    // ✅ Dry-run apply: no writes
    if (dryRun) {
      const applied = {
        dryRun: true,
        attempted: rows.length,
        updated: 0,
        created: 0,
        skipped: rows.length,
        missing: [],
        errors: [],
      };

      await Run.findByIdAndUpdate(run._id, {
        status: "succeeded",
        finishedAt: new Date(),
        stats: applied,
      });

      return res.json({
        runId: run._id,
        summary,
        headers,
        preview: rows.slice(0, 10),
        applied,
      });
    }

    // ✅ REAL APPLY
    const applied = await applyWebflowUnitsUpdateOnly({
      tenantId,
      matchKey,
      rows,
    });

    await Run.findByIdAndUpdate(run._id, {
      status: "succeeded",
      finishedAt: new Date(),
      stats: {
        attempted: rows.length,
        updated: applied.updated ?? 0,
        created: applied.created ?? 0,
        skipped: applied.skipped ?? 0,
        missing: applied.missing?.length ?? 0,
        errors: applied.errors?.length ?? 0,
      },
    });

    return res.json({
      runId: run._id,
      summary,
      headers,
      preview: rows.slice(0, 10),
      applied,
    });
  } catch (err) {
    if (run?._id) {
      await Run.findByIdAndUpdate(run._id, {
        status: "failed",
        finishedAt: new Date(),
        error: err?.message || "Apply failed",
      });
    }

    // If this is a CSV parse error, it’s still a 400
    const isCsvError = err?.details || err?.message?.toLowerCase?.().includes("csv");
    return res.status(isCsvError ? 400 : 500).json({
      error: err?.message || "Server error",
      details: err?.details,
    });
  }
});

export const importCsvRouter = router;