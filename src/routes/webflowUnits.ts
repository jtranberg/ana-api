// src/routes/webflowUnits.ts
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { searchUnitsInNode } from "../services/webflowUnits.js";

export const webflowUnitsRouter = Router();

type AuthedRequest = Request & { admin?: boolean };

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const key = req.header("x-admin-key");
  const secret = process.env.ADMIN_SECRET;

  if (!secret) return res.status(500).json({ error: "ADMIN_SECRET not set" });
  if (!key || key !== secret) return res.status(401).json({ error: "Unauthorized" });

  req.admin = true;
  return next();
}

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
  propertyId: z.string().min(1),
  unitNumber: z.string().optional(),
  available: z.coerce.boolean().optional(),
  availabilityDate: z.string().optional(),
  rent: z.coerce.number().optional(),
  bedrooms: z.coerce.number().optional(),
  bathrooms: z.coerce.number().optional(),
});

const PatchSchema = z.object({
  name: z.string().optional(),
  propertyId: z.string().optional(),
  unitNumber: z.string().optional(),
  available: z.coerce.boolean().optional(),
  availabilityDate: z.string().optional(),
  rent: z.coerce.number().optional(),
  bedrooms: z.coerce.number().optional(),
  bathrooms: z.coerce.number().optional(),
});

const UpsertSchema = z.object({
  propertyId: z.string().min(1),
  unitNumber: z.string().optional(),
  name: z.string().min(1),
  available: z.coerce.boolean().optional(),
  availabilityDate: z.string().optional(),
  rent: z.coerce.number().optional(),
  bedrooms: z.coerce.number().optional(),
  bathrooms: z.coerce.number().optional(),
});

function getUnitsCollectionId(): string {
  const id = process.env.WEBFLOW_COLLECTION_UNITS;
  if (!id) throw new Error("Missing WEBFLOW_COLLECTION_UNITS env var");
  return id;
}

function getWebflowToken(): string {
  const t = process.env.WEBFLOW_API_TOKEN;
  if (!t) throw new Error("Missing WEBFLOW_API_TOKEN env var");
  return t;
}

const WEBFLOW_V2 = "https://api.webflow.com/v2";

async function webflowV2<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}
): Promise<T> {
  const token = getWebflowToken();

  const res = await fetch(`${WEBFLOW_V2}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": opts.body ? "application/json" : "application/json",
      "accept-version": "2.0.0",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    const msg = data?.message || data?.error || data?.msg || res.statusText;
    throw new Error(`Webflow API error ${res.status}: ${msg}`);
  }

  return data as T;
}

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

// ✅ GET /api/webflow/units/search
webflowUnitsRouter.get("/units/search", async (req: Request, res: Response) => {
  const parsed = SearchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const items = await searchUnitsInNode(parsed.data);
    return res.json({ count: items.length, items });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ✅ POST /api/webflow/units (create)
webflowUnitsRouter.post("/units", requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const collectionId = getUnitsCollectionId();
    const created = await webflowV2<any>(`/collections/${collectionId}/items`, {
      method: "POST",
      body: { fieldData: buildFieldData(parsed.data) },
    });

    return res.json({ unit: created });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ✅ PATCH /api/webflow/units/:id (update)
webflowUnitsRouter.patch("/units/:id", requireAdmin, async (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const collectionId = getUnitsCollectionId();

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

    const updated = await webflowV2<any>(
      `/collections/${collectionId}/items/${req.params.id}`,
      {
        method: "PATCH",
        body: { fieldData },
      }
    );

    return res.json({ unit: updated });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ✅ POST /api/webflow/units/upsert
webflowUnitsRouter.post("/units/upsert", requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const collectionId = getUnitsCollectionId();

    const found = await searchUnitsInNode({
      propertyId: parsed.data.propertyId,
      unitNumber: parsed.data.unitNumber,
      max: 5,
    });

    if (found?.length) {
      const best =
        (parsed.data.unitNumber
          ? found.find((u: any) => String(u?.fieldData?.["unit-number"] ?? "") === parsed.data.unitNumber)
          : null) || found[0];

      const updated = await webflowV2<any>(
        `/collections/${collectionId}/items/${best.id}`,
        {
          method: "PATCH",
          body: { fieldData: buildFieldData(parsed.data) },
        }
      );

      return res.json({ mode: "updated", unit: updated });
    }

    const created = await webflowV2<any>(`/collections/${collectionId}/items`, {
      method: "POST",
      body: { fieldData: buildFieldData(parsed.data) },
    });

    return res.json({ mode: "created", unit: created });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default webflowUnitsRouter;