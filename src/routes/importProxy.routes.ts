import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { fetch, FormData } from "undici";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = String(req.header("x-admin-key") || "");
  const secret = String(process.env.ADMIN_SECRET || "wallsecure");
  if (!key || key !== secret) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function forwardCsv(req: Request, res: Response, targetPath: string) {
  const BASE = process.env.SYNDICATOR_BASE; // points to ana-api itself in option B
  if (!BASE) return res.status(500).json({ error: "SYNDICATOR_BASE not set" });

  const file = (req as any).file;
  if (!file?.buffer) return res.status(400).json({ error: "Missing CSV file" });

  const fd = new FormData();

  const blob = new Blob([file.buffer], { type: file.mimetype || "text/csv" });
  fd.append("file", blob, file.originalname || "upload.csv");

  fd.append("tenantId", String(req.body?.tenantId || "demo"));
  fd.append("matchKey", String(req.body?.matchKey || "item_id"));
  fd.append("mode", String(req.body?.mode || "update-only"));
  fd.append("dryRun", String(req.body?.dryRun ?? "true"));

  const upstream = await fetch(`${BASE}${targetPath}`, {
    method: "POST",
    headers: { "x-admin-key": String(process.env.ADMIN_SECRET || "wallsecure") },
    body: fd,
  });

  const raw = await upstream.text();
  try {
    return res.status(upstream.status).json(JSON.parse(raw));
  } catch {
    return res.status(upstream.status).send(raw);
  }
}

/**
 * PROXY ROUTES (what the frontend calls)
 * These forward to the REAL importer routes mounted at /api/importer/...
 */
router.post("/import/properties/csv", requireAdmin, upload.single("file"), (req, res) =>
  forwardCsv(req, res, "/api/importer/properties/csv")
);

router.post("/import/properties/csv/apply", requireAdmin, upload.single("file"), (req, res) =>
  forwardCsv(req, res, "/api/importer/properties/csv/apply")
);

export default router;