// src/services/webflowUnits.ts
/**
 * Webflow Units collection (v2) — TypeScript version
 * Uses direct fetch (no WebflowClient wrapper required)
 *
 * Required env:
 *   WEBFLOW_API_TOKEN
 *   WEBFLOW_COLLECTION_UNITS=698a0e851a56b059fe14febd
 *
 * Optional env:
 *   WEBFLOW_SITE_ID
 *
 * Field slugs (from your v2 collection response):
 * - available            (Switch)   -> "available"
 * - availability-date    (DateTime) -> "availability-date"
 * - rent                 (Number)   -> "rent"
 * - bedrooms             (Number)   -> "bedrooms"
 * - bathrooms            (Number)   -> "bathrooms"
 * - unit-number          (PlainText)-> "unit-number"   (optional)
 * - property-2           (Reference)-> "property-2"    (optional)
 * - name                 (PlainText)-> "name"          (required)
 * - slug                 (PlainText)-> "slug"          (required)
 */

export const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID;

const UNITS_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_UNITS;
const TOKEN = process.env.WEBFLOW_API_TOKEN;

const API_BASE = "https://api.webflow.com/v2";

export const UNIT_FIELDS = {
  available: "available",
  availabilityDate: "availability-date",
  rent: "rent",
  bedrooms: "bedrooms",
  bathrooms: "bathrooms",

  unitNumber: "unit-number",
  propertyRef: "property-2",

  name: "name",
  slug: "slug",
} as const;

type UnitFieldKey = (typeof UNIT_FIELDS)[keyof typeof UNIT_FIELDS];

export type WebflowV2Item = {
  id: string;
  cmsLocaleId?: string;
  lastPublished?: string;
  lastUpdated?: string;
  createdOn?: string;
  isArchived?: boolean;
  isDraft?: boolean;
  fieldData?: Record<string, unknown>;
};

type WebflowListResponse<TItem> = {
  items: TItem[];
  pagination?: {
    limit: number;
    offset: number;
    total?: number;
  };
};

export type UnitsSearchFilters = {
  propertyId?: string;
  propertyName?: string;
  unitNumber?: string;
  available?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  rentMin?: number;
  rentMax?: number;
  max?: number;
};

export type ApplyUpdateOnlyInput = {
  tenantId: string;
  matchKey: string;
  rows: Array<Record<string, unknown>>;
};

export type ApplyUpdateOnlyResult = {
  tenantId: string;
  matchKey: string;
  updated: number;
  skipped: number;
  missing: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
};

export type ListUnitsPageInput = {
  limit?: number;
  offset?: number;
  slug?: string;
  name?: string;
};

type WebflowFetchArgs = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
};

export class WebflowApiError extends Error {
  status?: number;
  details?: unknown;
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "WebflowApiError";
    this.status = status;
    this.details = details;
  }
}

// --------------------------
// Small parsing helpers
// --------------------------
function toBool(v: unknown): boolean | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "available"].includes(s)) return true;
  if (["false", "0", "no", "n", "unavailable"].includes(s)) return false;
  return undefined;
}

function toInt(v: unknown): number | undefined {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function toISODate(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

function stripHtml(s: unknown): string {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function norm(s: unknown): string {
  return stripHtml(s).toLowerCase();
}

function slugify(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function assertEnv(): asserts TOKEN is string {
  if (!TOKEN) throw new Error("Missing WEBFLOW_API_TOKEN env var");
  if (!UNITS_COLLECTION_ID) throw new Error("Missing WEBFLOW_COLLECTION_UNITS env var");
}

// --------------------------
// Webflow fetch wrapper (consistent errors + headers)
// --------------------------
async function webflowFetch<T = unknown>(path: string, args: WebflowFetchArgs = {}): Promise<T> {
  assertEnv();
  const { method = "GET", query, body } = args;

  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/json",
    "accept-version": "2.0.0",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const d = data as any;
    const details =
      d?.message ||
      d?.error ||
      d?.msg ||
      (typeof data === "string" ? data : "") ||
      res.statusText;

    throw new WebflowApiError(`Webflow API error ${res.status}: ${details}`, res.status, data);
  }

  return data as T;
}

// --------------------------
// Build PATCH payload from CSV row
// --------------------------
function buildPatchFromRow(r: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const available = toBool((r as any).available ?? (r as any).status);
  if (available !== undefined) patch[UNIT_FIELDS.available] = available;

  const availabilityDate = toISODate(
    (r as any)["availability-date"] ?? (r as any).availability_date ?? (r as any).available_date
  );
  if (availabilityDate) patch[UNIT_FIELDS.availabilityDate] = availabilityDate;

  const rent = toInt((r as any).rent ?? (r as any).price);
  if (rent !== undefined) patch[UNIT_FIELDS.rent] = rent;

  const beds = toInt((r as any).bedrooms ?? (r as any).beds);
  if (beds !== undefined) patch[UNIT_FIELDS.bedrooms] = beds;

  const baths = toInt((r as any).bathrooms ?? (r as any).baths);
  if (baths !== undefined) patch[UNIT_FIELDS.bathrooms] = baths;

  // Optional helpers
  if ((r as any).unit_number != null) patch[UNIT_FIELDS.unitNumber] = String((r as any).unit_number).trim();
  if ((r as any).property_id != null) patch[UNIT_FIELDS.propertyRef] = String((r as any).property_id).trim();

  // Only touch name/slug if provided OR safely derived
  const maybeName = String((r as any).name ?? "").trim();
  const maybeSlug = String((r as any).slug ?? "").trim();
  if (maybeName) patch[UNIT_FIELDS.name] = maybeName;
  if (maybeSlug) patch[UNIT_FIELDS.slug] = slugify(maybeSlug);

  if (!patch[UNIT_FIELDS.name] || !patch[UNIT_FIELDS.slug]) {
    const p = String((r as any).property_name ?? "").trim();
    const u = String((r as any).unit_number ?? "").trim();
    if (p && u) {
      const derived = `${p} ${u}`;
      patch[UNIT_FIELDS.name] = patch[UNIT_FIELDS.name] || derived;
      patch[UNIT_FIELDS.slug] = patch[UNIT_FIELDS.slug] || slugify(derived);
    }
  }

  // Clean out undefined/null/NaN + empty strings (avoid overwriting)
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined || v === null) delete patch[k];
    if (typeof v === "number" && Number.isNaN(v)) delete patch[k];
    if (typeof v === "string" && v.trim() === "") delete patch[k];
  }

  return patch;
}

// --------------------------
// WRITE: PATCH a Webflow item by itemId
// --------------------------
async function patchWebflowItem(args: { itemId: string; fieldData: Record<string, unknown> }): Promise<WebflowV2Item> {
  const { itemId, fieldData } = args;
  return webflowFetch<WebflowV2Item>(`/collections/${UNITS_COLLECTION_ID}/items/${itemId}`, {
    method: "PATCH",
    body: { fieldData },
  });
}

/**
 * CSV -> PATCH existing Webflow units (update-only)
 *
 * Supported matchKey values (normalized headers):
 * - "unit_id"     (Webflow item id) ✅ fastest / best
 * - "slug"
 * - "name"
 * - "unit_number" (requires property_id in the row OR you accept first match)
 *
 * NOTE: update-only = if no match found -> missing[], never creates.
 */
export async function applyWebflowUnitsUpdateOnly(input: ApplyUpdateOnlyInput): Promise<ApplyUpdateOnlyResult> {
  const { tenantId, matchKey, rows } = input;

  if (!matchKey) throw new Error("applyWebflowUnitsUpdateOnly requires matchKey");
  const key = String(matchKey).trim().toLowerCase();

  let updated = 0;
  let skipped = 0;
  const missing: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  // Small in-memory cache to reduce repeat lookups for same keys
  const cache = new Map<string, string | null>(); // cacheKey -> unitItemId | null

  async function resolveUnitItemId(row: Record<string, unknown>): Promise<string | null> {
    // 1) direct item id
    if (key === "unit_id") {
      const id = String((row as any).unit_id ?? "").trim();
      return id || null;
    }

    // 2) slug
    if (key === "slug") {
      const slug = String((row as any).slug ?? "").trim();
      if (!slug) return null;

      const cacheKey = `slug:${slug.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;

      const it = await findUnitBySlug(slug);
      const id = it?.id ? String(it.id) : null;
      cache.set(cacheKey, id);
      return id;
    }

    // 3) name (can be ambiguous; we take first match)
    if (key === "name") {
      const name = String((row as any).name ?? "").trim();
      if (!name) return null;

      const cacheKey = `name:${name.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;

      const items = await findUnitsByName(name);
      const it = items?.[0] || null;
      const id = it?.id ? String(it.id) : null;
      cache.set(cacheKey, id);
      return id;
    }

    // 4) unit_number (best if property_id is also provided)
    if (key === "unit_number") {
      const unitNumber = String((row as any).unit_number ?? "").trim();
      if (!unitNumber) return null;

      const propertyId = String((row as any).property_id ?? "").trim(); // optional but recommended
      const cacheKey = `unit:${propertyId || "any"}:${unitNumber.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;

      // If property_id exists, do a strong search
      if (propertyId) {
        const found = await searchUnitsInNode({ propertyId, unitNumber, max: 5 });
        const it = found?.[0] || null;
        const id = it?.id ? String(it.id) : null;
        cache.set(cacheKey, id);
        return id;
      }

      // If no property_id, do a weaker search by unitNumber only (can be slow/ambiguous)
      const found = await searchUnitsInNode({ unitNumber, max: 5 });
      const it = found?.[0] || null;
      const id = it?.id ? String(it.id) : null;
      cache.set(cacheKey, id);
      return id;
    }

    throw new Error(`Unsupported matchKey "${matchKey}". Use one of: unit_id, slug, name, unit_number`);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};

    let unitItemId: string | null = null;
    try {
      unitItemId = await resolveUnitItemId(r);
    } catch (e) {
      skipped++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ row: i + 2, error: msg });
      continue;
    }

    if (!unitItemId) {
      skipped++;
      missing.push({
        row: i + 2,
        [matchKey]: (r as any)?.[matchKey] ?? "",
        reason: "No match found in Webflow (update-only)",
      });
      continue;
    }

    const patch = buildPatchFromRow(r);
    if (!Object.keys(patch).length) {
      skipped++;
      continue;
    }

    try {
      await patchWebflowItem({ itemId: unitItemId, fieldData: patch });
      updated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const low = msg.toLowerCase();

      if (low.includes("not found") || low.includes("invalid") || low.includes("does not exist")) {
        missing.push({ row: i + 2, unit_id: unitItemId, reason: msg });
      } else {
        errors.push({ row: i + 2, unit_id: unitItemId, error: msg });
      }
    }
  }

  return { tenantId, matchKey, updated, skipped, missing, errors };
}

// --------------------------
// READ: list + search
// --------------------------

/**
 * Lists a page of units. Webflow v2 uses limit/offset.
 * NOTE: name/slug filters are supported (exact match), but
 * for arbitrary filters (property ref etc.) we paginate + filter in Node.
 */
export async function listUnitsPage(input: ListUnitsPageInput = {}): Promise<WebflowListResponse<WebflowV2Item>> {
  const { limit = 100, offset = 0, slug, name } = input;

  const query: Record<string, unknown> = { limit, offset };
  if (slug) query.slug = slugify(slug);
  if (name) query.name = String(name).trim();

  return webflowFetch<WebflowListResponse<WebflowV2Item>>(`/collections/${UNITS_COLLECTION_ID}/items`, {
    method: "GET",
    query,
  });
}

export async function findUnitBySlug(slug: string): Promise<WebflowV2Item | null> {
  const data = await listUnitsPage({ limit: 10, offset: 0, slug });
  const items = data?.items || [];
  return items[0] || null;
}

export async function findUnitsByName(name: string): Promise<WebflowV2Item[]> {
  const data = await listUnitsPage({ limit: 100, offset: 0, name });
  return data?.items || [];
}

/**
 * General “search” via pagination + in-memory filtering.
 * Use this when you want: propertyId, unitNumber, available, beds, rent range, etc.
 */
export async function searchUnitsInNode(filters: UnitsSearchFilters = {}): Promise<WebflowV2Item[]> {
  const {
    propertyId,
    propertyName,
    unitNumber,
    available,
    bedrooms,
    bathrooms,
    rentMin,
    rentMax,
    max = 5000,
  } = filters;

  const out: WebflowV2Item[] = [];
  let offset = 0;
  const limit = 100;

  const wantPropName = propertyName ? norm(propertyName) : "";

  while (out.length < max) {
    const data = await listUnitsPage({ limit, offset });
    const items = data?.items || [];
    if (!items.length) break;

    for (const it of items) {
      const fd = (it.fieldData || {}) as Record<string, unknown>;

      // ✅ propertyId (strongest match)
      if (propertyId && String(fd[UNIT_FIELDS.propertyRef] || "") !== String(propertyId)) continue;

      // ✅ propertyName (friendly match)
      if (wantPropName) {
        const pn = norm(fd["property-name"]);
        const ps = norm(fd["property-slug"]);
        const unitName = norm(fd[UNIT_FIELDS.name]);

        if (!pn.includes(wantPropName) && !ps.includes(wantPropName) && !unitName.includes(wantPropName)) continue;
      }

      if (unitNumber && String(fd[UNIT_FIELDS.unitNumber] || "").trim() !== String(unitNumber).trim()) continue;

      if (available !== undefined && Boolean(fd[UNIT_FIELDS.available]) !== Boolean(available)) continue;

      if (bedrooms !== undefined && Number(fd[UNIT_FIELDS.bedrooms]) !== Number(bedrooms)) continue;
      if (bathrooms !== undefined && Number(fd[UNIT_FIELDS.bathrooms]) !== Number(bathrooms)) continue;

      const rentVal = Number(fd[UNIT_FIELDS.rent]);
      if (rentMin !== undefined && !(rentVal >= Number(rentMin))) continue;
      if (rentMax !== undefined && !(rentVal <= Number(rentMax))) continue;

      out.push(it);
      if (out.length >= max) break;
    }

    offset += limit;
  }

  return out;
}