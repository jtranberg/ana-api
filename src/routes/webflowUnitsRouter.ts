// src/routes/webflowUnitsRouter.ts
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { WebflowClient } from "../webflow/client.js";
import { config } from "../config.js";
import { searchUnitsInNode } from "../services/webflowUnits.js";

export const webflowUnitsRouter = Router();

/* =========================================================
   Types
========================================================= */
type AuthedRequest = Request & { admin?: boolean };

type WebflowUnitFieldData = Record<string, unknown> & {
  name?: string;
  "property-2"?: string;
  "unit-number"?: string;
  available?: boolean;
  "availability-date"?: string | null;
  rent?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
};

type WebflowItem = {
  id: string;
  fieldData?: Record<string, unknown>;
};

/* =========================================================
   Admin middleware
========================================================= */
function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const key = req.header("x-admin-key");
  const secret = process.env.ADMIN_SECRET;

  if (!secret) return res.status(500).json({ error: "ADMIN_SECRET not set" });
  if (!key || key !== secret) return res.status(401).json({ error: "Unauthorized" });

  req.admin = true;
  return next();
}

function getUnitsCollectionId(): string {
  const id = process.env.WEBFLOW_COLLECTION_UNITS;
  if (!id) throw new Error("Missing WEBFLOW_COLLECTION_UNITS env var");
  return id;
}

function wf(): WebflowClient {
  if (!config?.webflowApiToken) throw new Error("Missing config.webflowToken");
  return new WebflowClient(config.webflowApiToken);
}

/* =========================================================
   Schemas
========================================================= */
const SearchSchema = z.object({
  propertyId: z.string().optional(),
  propertyName: z.string().optional(),
  unitNumber: z.string().optional(),
  available: z.coerce.boolean().optional(),
  bedrooms: z.coerce.number().optional(),
  bathrooms: z.coerce.number().optional(),
  rentMin: z.coerce.number().optional(),
  rentMax: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
});

const CreateSchema = z.object({
  name: z.string().min(1),
  propertyId: z.string().min(1), // Webflow property item id (reference)
  unitNumber: z.string().optional(),
  available: z.boolean().optional(),
  availabilityDate: z.string().optional(), // ISO string
  rent: z.number().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
});

const PatchSchema = z.object({
  name: z.string().optional(),
  propertyId: z.string().optional(),
  unitNumber: z.string().optional(),
  available: z.boolean().optional(),
  availabilityDate: z.string().optional(),
  rent: z.number().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
});

const UpsertSchema = z.object({
  propertyId: z.string().min(1),
  unitNumber: z.string().optional(),
  name: z.string().min(1),
  available: z.boolean().optional(),
  availabilityDate: z.string().optional(),
  rent: z.number().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
});

/* =========================================================
   Helpers
========================================================= */
function buildFieldData(input: {
  name: string;
  propertyId: string;
  unitNumber?: string;
  available?: boolean;
  availabilityDate?: string;
  rent?: number;
  bedrooms?: number;
  bathrooms?: number;
}): WebflowUnitFieldData {
  return {
    name: input.name,
    "property-2": input.propertyId,
    "unit-number": input.unitNumber ?? "",
    available: input.available ?? true,
    "availability-date": input.availabilityDate ?? null,
    rent: input.rent ?? null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
  };
}

/* =========================================================
   Routes
   Mount at: app.use("/api/webflow", webflowUnitsRouter)
========================================================= */

// GET /api/webflow/units/search
webflowUnitsRouter.get("/units/search", async (req: Request, res: Response) => {
  const parsed = SearchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const items = await searchUnitsInNode(parsed.data);
    return res.json({ count: items.length, items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/webflow/units
 * Creates a unit in Webflow (admin only)
 */
webflowUnitsRouter.post("/units", requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const created = await wf().createItem(getUnitsCollectionId(), {
      fieldData: buildFieldData(parsed.data),
    });

    return res.json({ unit: created });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /api/webflow/units/:id
 * Updates an existing unit item (admin only)
 */
webflowUnitsRouter.patch("/units/:id", requireAdmin, async (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const fieldData: WebflowUnitFieldData = {};

    if (parsed.data.name !== undefined) fieldData.name = parsed.data.name;
    if (parsed.data.propertyId !== undefined) fieldData["property-2"] = parsed.data.propertyId;
    if (parsed.data.unitNumber !== undefined) fieldData["unit-number"] = parsed.data.unitNumber;
    if (parsed.data.available !== undefined) fieldData.available = parsed.data.available;
    if (parsed.data.availabilityDate !== undefined)
      fieldData["availability-date"] = parsed.data.availabilityDate;
    if (parsed.data.rent !== undefined) fieldData.rent = parsed.data.rent;
    if (parsed.data.bedrooms !== undefined) fieldData.bedrooms = parsed.data.bedrooms;
    if (parsed.data.bathrooms !== undefined) fieldData.bathrooms = parsed.data.bathrooms;

    const updated = await wf().updateItem(getUnitsCollectionId(), String(req.params.id), { fieldData });
    return res.json({ unit: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/webflow/units/upsert
 * Finds a unit by (propertyId + unitNumber) and updates if found; else creates. (admin only)
 */
webflowUnitsRouter.post("/units/upsert", requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const found = await searchUnitsInNode({
      propertyId: parsed.data.propertyId,
      unitNumber: parsed.data.unitNumber,
      max: 5,
    });

    const client = wf();
    const collectionId = getUnitsCollectionId();

    if (found?.length) {
      const best =
        (parsed.data.unitNumber
          ? (found as WebflowItem[]).find(
              (u) => String(u?.fieldData?.["unit-number"] ?? "") === String(parsed.data.unitNumber)
            )
          : null) || (found as WebflowItem[])[0];

      const updated = await client.updateItem(collectionId, best.id, {
        fieldData: buildFieldData(parsed.data),
      });

      return res.json({ mode: "updated", unit: updated });
    }

    const created = await client.createItem(collectionId, {
      fieldData: buildFieldData(parsed.data),
    });

    return res.json({ mode: "created", unit: created });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
});

export default webflowUnitsRouter;