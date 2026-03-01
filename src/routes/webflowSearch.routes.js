import { Router } from "express";
import { z } from "zod";
import { searchUnitsInNode } from "../services/webflowUnits.js";

export const webflowSearchRouter = Router();

/**
 * GET /api/webflow/units/search
 * Query examples:
 *  - ?propertyId=xxx
 *  - ?unitNumber=201
 *  - ?available=true
 *  - ?rentMin=1500&rentMax=2200
 */
webflowSearchRouter.get("/webflow/units/search", async (req, res) => {
  const schema = z.object({
    propertyId: z.string().optional(),
    unitNumber: z.string().optional(),
    available: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    bedrooms: z.string().optional(),
    bathrooms: z.string().optional(),
    rentMin: z.string().optional(),
    rentMax: z.string().optional(),
    max: z.string().optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const q = parsed.data;

  const results = await searchUnitsInNode({
    propertyId: q.propertyId,
    unitNumber: q.unitNumber,
    available: q.available,
    bedrooms: q.bedrooms ? Number(q.bedrooms) : undefined,
    bathrooms: q.bathrooms ? Number(q.bathrooms) : undefined,
    rentMin: q.rentMin ? Number(q.rentMin) : undefined,
    rentMax: q.rentMax ? Number(q.rentMax) : undefined,
    max: q.max ? Number(q.max) : 1000,
  });

  // Return a lightweight payload (avoid sending huge objects)
  const mapped = results.map((it) => ({
    id: it.id,
    name: it.fieldData?.name,
    slug: it.fieldData?.slug,
    available: it.fieldData?.available,
    rent: it.fieldData?.rent,
    bedrooms: it.fieldData?.bedrooms,
    bathrooms: it.fieldData?.bathrooms,
    unitNumber: it.fieldData?.["unit-number"],
    propertyRef: it.fieldData?.["property-2"],
    updatedOn: it.lastUpdated,
  }));

  res.json({ count: mapped.length, items: mapped });
});
