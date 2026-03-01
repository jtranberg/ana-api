import { Router } from "express";
import { z } from "zod";
import { WebflowClient } from "../webflow/client.js";
import { config } from "../config.js";
import { searchUnitsInNode } from "../services/webflowUnits.js";

export const webflowUnitsRouter = Router();

const requireAdmin = (req, res, next) => {
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// GET /api/webflow/units/search
webflowUnitsRouter.get("/units/search", async (req, res) => {
  const schema = z.object({
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

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const items = await searchUnitsInNode(parsed.data);
    return res.json({ count: items.length, items });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

/**
 * POST /api/webflow/units
 * Creates a unit in Webflow (admin only)
 */
webflowUnitsRouter.post("/units", requireAdmin, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    propertyId: z.string().min(1),      // Webflow property item id (reference)
    unitNumber: z.string().optional(),
    available: z.boolean().optional(),
    availabilityDate: z.string().optional(), // ISO string
    rent: z.number().optional(),
    bedrooms: z.number().optional(),
    bathrooms: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const wf = new WebflowClient(config.webflowToken);

    const created = await wf.createItem(process.env.WEBFLOW_COLLECTION_UNITS, {
      fieldData: {
        name: parsed.data.name,
        "property-2": parsed.data.propertyId, // ✅ your reference field slug from earlier notes
        "unit-number": parsed.data.unitNumber ?? "",
        available: parsed.data.available ?? true,
        "availability-date": parsed.data.availabilityDate ?? null,
        rent: parsed.data.rent ?? null,
        bedrooms: parsed.data.bedrooms ?? null,
        bathrooms: parsed.data.bathrooms ?? null,
      },
    });

    res.json({ unit: created });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/**
 * PATCH /api/webflow/units/:id
 * Updates an existing unit item
 */
webflowUnitsRouter.patch("/units/:id", requireAdmin, async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    propertyId: z.string().optional(),
    unitNumber: z.string().optional(),
    available: z.boolean().optional(),
    availabilityDate: z.string().optional(),
    rent: z.number().optional(),
    bedrooms: z.number().optional(),
    bathrooms: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const wf = new WebflowClient(config.webflowToken);

    const fieldData = {};
    if (parsed.data.name !== undefined) fieldData.name = parsed.data.name;
    if (parsed.data.propertyId !== undefined) fieldData["property-2"] = parsed.data.propertyId;
    if (parsed.data.unitNumber !== undefined) fieldData["unit-number"] = parsed.data.unitNumber;
    if (parsed.data.available !== undefined) fieldData.available = parsed.data.available;
    if (parsed.data.availabilityDate !== undefined) fieldData["availability-date"] = parsed.data.availabilityDate;
    if (parsed.data.rent !== undefined) fieldData.rent = parsed.data.rent;
    if (parsed.data.bedrooms !== undefined) fieldData.bedrooms = parsed.data.bedrooms;
    if (parsed.data.bathrooms !== undefined) fieldData.bathrooms = parsed.data.bathrooms;

    const updated = await wf.updateItem(process.env.WEBFLOW_COLLECTION_UNITS, req.params.id, {
      fieldData,
    });

    res.json({ unit: updated });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/**
 * POST /api/webflow/units/upsert
 * Finds a unit by (propertyId + unitNumber OR name) and updates if found; else creates.
 * This is the endpoint your CSV importer should use.
 */
webflowUnitsRouter.post("/units/upsert", requireAdmin, async (req, res) => {
  const schema = z.object({
    propertyId: z.string().min(1),
    unitNumber: z.string().optional(),
    name: z.string().min(1),
    available: z.boolean().optional(),
    availabilityDate: z.string().optional(),
    rent: z.number().optional(),
    bedrooms: z.number().optional(),
    bathrooms: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    // 1) search for existing
    const found = await searchUnitsInNode({
      propertyId: parsed.data.propertyId,
      unitNumber: parsed.data.unitNumber,
      max: 5,
    });

    const wf = new WebflowClient(config.webflowToken);

    if (found?.length) {
      // pick best match (unit-number match first)
      const best =
        (parsed.data.unitNumber
          ? found.find((u) => u?.fieldData?.["unit-number"] === parsed.data.unitNumber)
          : null) || found[0];

      const updated = await wf.updateItem(process.env.WEBFLOW_COLLECTION_UNITS, best.id, {
        fieldData: {
          name: parsed.data.name,
          "property-2": parsed.data.propertyId,
          "unit-number": parsed.data.unitNumber ?? "",
          available: parsed.data.available ?? true,
          "availability-date": parsed.data.availabilityDate ?? null,
          rent: parsed.data.rent ?? null,
          bedrooms: parsed.data.bedrooms ?? null,
          bathrooms: parsed.data.bathrooms ?? null,
        },
      });

      return res.json({ mode: "updated", unit: updated });
    }

    // 2) create new
    const created = await wf.createItem(process.env.WEBFLOW_COLLECTION_UNITS, {
      fieldData: {
        name: parsed.data.name,
        "property-2": parsed.data.propertyId,
        "unit-number": parsed.data.unitNumber ?? "",
        available: parsed.data.available ?? true,
        "availability-date": parsed.data.availabilityDate ?? null,
        rent: parsed.data.rent ?? null,
        bedrooms: parsed.data.bedrooms ?? null,
        bathrooms: parsed.data.bathrooms ?? null,
      },
    });

    return res.json({ mode: "created", unit: created });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});