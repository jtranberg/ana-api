// src/services/webflowUnits.ts
/**
 * Webflow Units collection (v2)
 * Uses direct fetch (no WebflowClient wrapper required)
 *
 * Required env:
 *   WEBFLOW_API_TOKEN
 *   WEBFLOW_COLLECTION_UNITS=698a0e851a56b059fe14febd
 *
 * Optional env:
 *   WEBFLOW_SITE_ID
 *
 * Field slugs:
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

export const WEBFLOW_SITE_ID: string | undefined = process.env.WEBFLOW_SITE_ID;

const API_BASE = "https://api.webflow.com/v2" as const;

const UNIT_FIELDS = {
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

export type WebflowV2Item = {
  id: string;
  fieldData?: Record<string, unknown>;
};

type WebflowError = Error & {
  status?: number;
  details?: unknown;
};

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
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// --------------------------
// Webflow fetch wrapper (consistent errors + headers)
// --------------------------
async function webflowFetch<T>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PATCH";
    query?: Record<string, unknown>;
    body?: unknown;
  } = {}
): Promise<T> {
  const token = getWebflowToken();

  const { method = "GET", query, body } = opts;

  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      "accept-version": "2.0.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    const details =
      data?.message ||
      data?.error ||
      data?.msg ||
      (typeof data === "string" ? data : "") ||
      res.statusText;

    const err = new Error(`Webflow API error ${res.status}: ${details}`) as WebflowError;
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data as T;
}

// --------------------------
// Build PATCH payload from CSV row
// --------------------------
export type CsvRow = Record<string, unknown>;

function buildPatchFromRow(r: CsvRow): Record<string, unknown> {
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

  if ((r as any).unit_number != null)
    patch[UNIT_FIELDS.unitNumber] = String((r as any).unit_number).trim();
  if ((r as any).property_id != null)
    patch[UNIT_FIELDS.propertyRef] = String((r as any).property_id).trim();

  const maybeName = String((r as any).name ?? "").trim();
  const maybeSlug = String((r as any).slug ?? "").trim();
  if (maybeName) patch[UNIT_FIELDS.name] = maybeName;
  if (maybeSlug) patch[UNIT_FIELDS.slug] = slugify(maybeSlug);

  if (!patch[UNIT_FIELDS.name] || !patch[UNIT_FIELDS.slug]) {
    const p = String((r as any).property_name ?? "").trim();
    const u = String((r as any).unit_number ?? "").trim();
    if (p && u) {
      const derived = `${p} ${u}`;
      patch[UNIT_FIELDS.name] = (patch[UNIT_FIELDS.name] as string | undefined) || derived;
      patch[UNIT_FIELDS.slug] = (patch[UNIT_FIELDS.slug] as string | undefined) || slugify(derived);
    }
  }

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
async function patchWebflowItem(args: { itemId: string; fieldData: Record<string, unknown> }) {
  const collectionId = getUnitsCollectionId();
  return webflowFetch(`/collections/${collectionId}/items/${args.itemId}`, {
    method: "PATCH",
    body: { fieldData: args.fieldData },
  });
}

export type ApplyUpdateOnlyArgs = {
  tenantId: string;
  matchKey: string;
  rows: CsvRow[];
};

export type ApplyUpdateOnlyResult = {
  tenantId: string;
  matchKey: string;
  updated: number;
  skipped: number;
  missing: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
};

export async function applyWebflowUnitsUpdateOnly({
  tenantId,
  matchKey,
  rows,
}: ApplyUpdateOnlyArgs): Promise<ApplyUpdateOnlyResult> {
  if (!matchKey) throw new Error("applyWebflowUnitsUpdateOnly requires matchKey");
  const key = String(matchKey).trim().toLowerCase();

  let updated = 0;
  let skipped = 0;
  const missing: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  const cache = new Map<string, string | null>();

  async function resolveUnitItemId(row: CsvRow): Promise<string | null> {
    if (key === "unit_id") {
      const id = String((row as any).unit_id ?? "").trim();
      return id || null;
    }

    if (key === "slug") {
      const slug = String((row as any).slug ?? "").trim();
      if (!slug) return null;

      const cacheKey = `slug:${slug.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

      const it = await findUnitBySlug(slug);
      const id = it?.id ? String(it.id) : null;
      cache.set(cacheKey, id);
      return id;
    }

    if (key === "name") {
      const name = String((row as any).name ?? "").trim();
      if (!name) return null;

      const cacheKey = `name:${name.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

      const items = await findUnitsByName(name);
      const it = items?.[0] || null;
      const id = it?.id ? String(it.id) : null;
      cache.set(cacheKey, id);
      return id;
    }

    if (key === "unit_number") {
      const unitNumber = String((row as any).unit_number ?? "").trim();
      if (!unitNumber) return null;

      const propertyId = String((row as any).property_id ?? "").trim();
      const cacheKey = `unit:${propertyId || "any"}:${unitNumber.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

      if (propertyId) {
        const found = await searchUnitsInNode({ propertyId, unitNumber, max: 5 });
        const it = found?.[0] || null;
        const id = it?.id ? String(it.id) : null;
        cache.set(cacheKey, id);
        return id;
      }

      const found = await searchUnitsInNode({ unitNumber, max: 5 });
      const it = found?.[0] || null;
      const id = it?.id ? String(it.id) : null;
      cache.set(cacheKey, id);
      return id;
    }

    throw new Error(
      `Unsupported matchKey "${matchKey}". Use one of: unit_id, slug, name, unit_number`
    );
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};

    let unitItemId: string | null = null;
    try {
      unitItemId = await resolveUnitItemId(r);
    } catch (e: unknown) {
      skipped++;
      errors.push({
        row: i + 2,
        error: e instanceof Error ? e.message : String(e),
      });
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
    } catch (e: unknown) {
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
export type ListUnitsPageArgs = {
  limit?: number;
  offset?: number;
  slug?: string;
  name?: string;
};

export async function listUnitsPage({
  limit = 100,
  offset = 0,
  slug,
  name,
}: ListUnitsPageArgs = {}) {
  const collectionId = getUnitsCollectionId();

  const query: Record<string, unknown> = { limit, offset };
  if (slug) query.slug = slugify(slug);
  if (name) query.name = String(name).trim();

  return webflowFetch<{ items?: WebflowV2Item[] }>(`/collections/${collectionId}/items`, {
    method: "GET",
    query,
  });
}

/**
 * NEW: fetch every unit across all Webflow pages
 * Use this in the syndicator/canonical pipeline instead of a single listUnitsPage() call.
 */
export async function listAllUnits(max = 10000): Promise<WebflowV2Item[]> {
  const all: WebflowV2Item[] = [];
  let offset = 0;
  const limit = 100;

  while (all.length < max) {
    const data = await listUnitsPage({ limit, offset });
    const items = data?.items || [];

    if (!items.length) break;

    all.push(...items);

    if (items.length < limit) break;

    offset += limit;
  }

  return all;
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

export type SearchUnitsFilters = {
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

/**
 * General “search” via pagination + in-memory filtering.
 */
export async function searchUnitsInNode(
  filters: SearchUnitsFilters = {}
): Promise<WebflowV2Item[]> {
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
      const fd = it.fieldData || {};

      if (propertyId && String(fd[UNIT_FIELDS.propertyRef] ?? "") !== String(propertyId)) continue;

      if (wantPropName) {
        const pn = norm((fd as any)["property-name"]);
        const ps = norm((fd as any)["property-slug"]);
        const unitName = norm(fd[UNIT_FIELDS.name]);

        if (
          !pn.includes(wantPropName) &&
          !ps.includes(wantPropName) &&
          !unitName.includes(wantPropName)
        ) {
          continue;
        }
      }

      if (unitNumber) {
        const unitValue = String(fd[UNIT_FIELDS.unitNumber] ?? "")
          .toLowerCase()
          .trim();

        const queryValue = String(unitNumber)
          .toLowerCase()
          .trim();

        if (!unitValue.includes(queryValue)) {
          continue;
        }
      }

      if (available !== undefined && Boolean(fd[UNIT_FIELDS.available]) !== Boolean(available)) {
        continue;
      }

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