import express, { Request, Response, NextFunction } from "express";
import { WebflowClient } from "../webflow/client.js";
import { config } from "../config.js";

const router = express.Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = req.header("x-admin-key") || "";
  const secret = process.env.ADMIN_SECRET || "wallsecure";
  if (!key || key !== secret) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

// GET /api/webflow/properties
router.get("/properties", async (_req: Request, res: Response) => {
  try {
    const token = config.webflowApiToken;
    if (!token) return res.status(500).json({ error: "WEBFLOW token missing (config.webflowApiToken)" });

    const collectionId = mustEnv("WEBFLOW_COLLECTION_PROPERTIES");
    const wf = new WebflowClient(token);

    const items = await (wf as any).listItems(collectionId);
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch properties" });
  }
});

// POST /api/webflow/properties
router.post("/properties", requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = config.webflowApiToken;
    if (!token) return res.status(500).json({ error: "WEBFLOW token missing (config.webflowApiToken)" });

    const collectionId = mustEnv("WEBFLOW_COLLECTION_PROPERTIES");

    const body = (req.body || {}) as { name?: string; suite?: string; photoUrl?: string };
    const name = String(body.name || "").trim();
    const suite = String(body.suite || "").trim();
    const photoUrl = String(body.photoUrl || "").trim();

    if (!name) return res.status(400).json({ error: "name is required" });

    const wf = new WebflowClient(token);

    const created = await (wf as any).createItem(collectionId, {
      fieldData: {
        name,
        suite,
        "photo-url": photoUrl,
      },
    });

    return res.json({ property: created });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to create property" });
  }
});

// DELETE /api/webflow/properties/:id
router.delete("/properties/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = config.webflowApiToken;
    if (!token) return res.status(500).json({ error: "WEBFLOW token missing (config.webflowApiToken)" });

    const collectionId = mustEnv("WEBFLOW_COLLECTION_PROPERTIES");
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing :id" });

    const wf = new WebflowClient(token);
    await (wf as any).deleteItem(collectionId, id);

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to delete property" });
  }
});

export default router;