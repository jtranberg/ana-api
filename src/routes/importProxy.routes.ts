import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { fetch, FormData } from "undici";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = req.header("x-admin-key");
  const secret = process.env.ADMIN_SECRET || "wallsecure";
  if (key !== secret) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function forwardCsv(
  req: Request,
  res: Response,
  targetPath: string
) {
  const SYNDICATOR_BASE = process.env.SYNDICATOR_BASE;
  if (!SYNDICATOR_BASE) {
    return res.status(500).json({ error: "SYNDICATOR_BASE not set" });
  }

  if (!(req as any).file?.buffer) {
    return res.status(400).json({ error: "Missing CSV file" });
  }

  const fd = new FormData();

  const file = (req as any).file;

  const blob = new Blob([file.buffer], {
    type: file.mimetype || "text/csv",
  });

  fd.append("file", blob, file.originalname || "upload.csv");

  fd.append("tenantId", String(req.body.tenantId || "demo"));
  fd.append("matchKey", String(req.body.matchKey || "item_id"));
  fd.append("mode", String(req.body.mode || "update-only"));
  fd.append("dryRun", String(req.body.dryRun ?? "true"));

  const syndRes = await fetch(`${SYNDICATOR_BASE}${targetPath}`, {
    method: "POST",
    headers: {
      "x-admin-key": process.env.ADMIN_SECRET || "wallsecure",
    },
    body: fd,
  });

  const raw = await syndRes.text();

  try {
    return res.status(syndRes.status).json(JSON.parse(raw));
  } catch {
    return res.status(syndRes.status).send(raw);
  }
}

router.post(
  "/import/properties/csv",
  requireAdmin,
  upload.single("file"),
  async (req: Request, res: Response) => {
    return forwardCsv(req, res, "/api/import/properties/csv");
  }
);

router.post(
  "/import/properties/csv/apply",
  requireAdmin,
  upload.single("file"),
  async (req: Request, res: Response) => {
    return forwardCsv(req, res, "/api/import/properties/csv/apply");
  }
);

export default router;