import express, { Request, Response, NextFunction } from "express";
import { WebflowClient } from "../webflow/client.js";
import { config } from "../config.js";

const router = express.Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = String(req.header("x-admin-key") || "");
  const secret = process.env.ADMIN_SECRET || "wallsecure";
  if (!key || key !== secret) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

// Webflow Properties field slugs
const FIELDS = {
  name: "name",
  suite: "suite",
  photoUrl: "photo-url",

  contactEmail: "contact-email",
  externalWebsite: "external-website",
  propertyAddress: "property-address",
  latitude: "latitude",
  longitude: "longitude",
};

type WebflowItem = {
  id: string;
  isDraft?: boolean;
  isArchived?: boolean;
  lastPublished?: string;
  lastUpdated?: string;
  fieldData?: Record<string, any>;
};

function toProperty(item: WebflowItem) {
  const fd = item.fieldData || {};

  return {
    _id: item.id,
    webflowId: item.id,

    name: String(fd[FIELDS.name] || ""),
    suite: String(fd[FIELDS.suite] || ""),
    photoUrl: String(fd[FIELDS.photoUrl] || ""),

    email: String(fd[FIELDS.contactEmail] || ""),
    website: String(fd[FIELDS.externalWebsite] || ""),
    propertyAddress: String(fd[FIELDS.propertyAddress] || ""),
    latitude: String(fd[FIELDS.latitude] || ""),
    longitude: String(fd[FIELDS.longitude] || ""),

    isDraft: !!item.isDraft,
    isArchived: !!item.isArchived,
    lastPublished: item.lastPublished,
    lastUpdated: item.lastUpdated,
  };
}

// GET /api/webflow/properties
router.get("/properties", async (_req: Request, res: Response) => {
  try {
    const token = config.webflowApiToken;
    if (!token) return res.status(500).json({ error: "Missing config.webflowApiToken" });

    const collectionId = mustEnv("WEBFLOW_COLLECTION_PROPERTIES");
    const wf = new WebflowClient(token);

    const data = await wf.v2<{ items?: WebflowItem[] }>(
      `/collections/${collectionId}/items`,
      { method: "GET" }
    );

    const items: WebflowItem[] = Array.isArray(data?.items) ? data.items as WebflowItem[] : [];
    return res.json(items.map(toProperty));
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch properties" });
  }
});

// POST /api/webflow/properties
router.post("/properties", requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = config.webflowApiToken;
    if (!token) return res.status(500).json({ error: "Missing config.webflowApiToken" });

    const collectionId = mustEnv("WEBFLOW_COLLECTION_PROPERTIES");
    const wf = new WebflowClient(token);

    const name = String(req.body?.name || "").trim();
    const suite = String(req.body?.suite || "").trim();
    const photoUrl = String(req.body?.photoUrl || "").trim();
    const email = String(req.body?.email || "").trim();
    const website = String(req.body?.website || "").trim();
    const propertyAddress = String(req.body?.propertyAddress || "").trim();
    const latitude = String(req.body?.latitude || "").trim();
    const longitude = String(req.body?.longitude || "").trim();

    if (!name) return res.status(400).json({ error: "name is required" });

    const created = await wf.createItem(collectionId, {
      isDraft: false,
      fieldData: {
        [FIELDS.name]: name,
        [FIELDS.suite]: suite,
        [FIELDS.photoUrl]: photoUrl,
        [FIELDS.contactEmail]: email,
        [FIELDS.externalWebsite]: website,
        [FIELDS.propertyAddress]: propertyAddress,
        [FIELDS.latitude]: latitude,
        [FIELDS.longitude]: longitude,
      },
    });

    return res.json({ property: toProperty(created as any) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to create property" });
  }
});

// DELETE /api/webflow/properties/:id
router.delete("/properties/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = config.webflowApiToken;
    if (!token) return res.status(500).json({ error: "Missing config.webflowApiToken" });

    const collectionId = mustEnv("WEBFLOW_COLLECTION_PROPERTIES");
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing :id" });

    const wf = new WebflowClient(token);
    await wf.deleteItem(collectionId, id);

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to delete property" });
  }
});

export default router;