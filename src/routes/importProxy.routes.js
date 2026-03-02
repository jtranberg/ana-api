/* eslint-env node */
import express from "express";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");
  const secret = process.env.ADMIN_SECRET || "wallsecure";
  if (key !== secret) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function forwardCsv(req, res, targetPath) {
  const SYNDICATOR_BASE = process.env.SYNDICATOR_BASE;
  if (!SYNDICATOR_BASE) {
    return res.status(500).json({ error: "SYNDICATOR_BASE not set on this server" });
  }
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "Missing CSV file (field name must be 'file')" });
  }

  // Build multipart body to send to syndicator
  const fd = new FormData();

  // File -> Blob (Node 18+ has Blob/FormData)
  const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "text/csv" });
  fd.append("file", blob, req.file.originalname || "upload.csv");

  // Pass through form fields (with safe defaults)
  fd.append("tenantId", String(req.body.tenantId || "demo"));
  fd.append("matchKey", String(req.body.matchKey || "item_id"));
  fd.append("mode", String(req.body.mode || "update-only"));
  fd.append("dryRun", String(req.body.dryRun ?? "true"));

  const url = `${SYNDICATOR_BASE}${targetPath}`;

  const syndRes = await fetch(url, {
    method: "POST",
    headers: {
      // keep admin protection consistent
      "x-admin-key": process.env.ADMIN_SECRET || "wallsecure",
    },
    body: fd,
  });

  const raw = await syndRes.text();
  try {
    return res.status(syndRes.status).json(JSON.parse(raw));
  } catch {
    // syndicator returned HTML or plain text
    return res.status(syndRes.status).send(raw);
  }
}

/**
 * PREVIEW
 * POST /api/import/properties/csv
 */
router.post("/import/properties/csv", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    return await forwardCsv(req, res, "/api/import/properties/csv");
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Proxy error" });
  }
});

/**
 * APPLY
 * POST /api/import/properties/csv/apply
 */
router.post("/import/properties/csv/apply", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    return await forwardCsv(req, res, "/api/import/properties/csv/apply");
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Proxy error" });
  }
});

export default router;