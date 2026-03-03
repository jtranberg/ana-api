import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { WebflowClient } from "../webflow/client.js"; // ✅ keep .js extension in node16/nodenext TS

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Admin gate
 */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = String(req.header("x-admin-key") || "");
  const secret = String(process.env.ADMIN_SECRET || "wallsecure");
  if (!key || key !== secret) return res.status(401).json({ error: "Unauthorized" });
  next();
}

type WebflowItem = {
  id: string;
  fieldData?: Record<string, any>;
  isArchived?: boolean;
  isDraft?: boolean;
};

const PROPS_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_PROPERTIES || "";
const WEBFLOW_TOKEN = process.env.WEBFLOW_API_TOKEN || "";

/**
 * CSV header -> Webflow field slug
 * NOTE: these keys are AFTER normalization (snake_case)
 */
const FIELD_MAP: Record<string, string> = {
  name: "name",
  suite: "suite",
  photo_url: "photo-url",
  photo: "photo-url",
  photourl: "photo-url",
  photo_url_full: "photo-url",
};

/** form-data can sometimes come in as string[] */
const first = (v: any) => (Array.isArray(v) ? v[0] : v);

function qBool(v: unknown) {
  const s = String(first(v) ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function norm(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Normalize CSV header keys:
 *  "Item ID" -> "item_id"
 *  "Collection ID" -> "collection_id"
 *  "Photo URL" -> "photo_url"
 */
function normKey(k: unknown) {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .replace(/\?/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRow(row: Record<string, any>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[normKey(k)] = String(v ?? "").trim();
  }
  return out;
}

function csvToRows(buffer: Buffer) {
  const text = buffer.toString("utf-8");
  const rawRecords = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as Record<string, any>[];

  // normalize headers + row keys
  const records = rawRecords.map(normalizeRow);
  const headers = records.length ? Object.keys(records[0]) : [];

  return { headers, records };
}

/**
 * Build fieldData payload from CSV row (normalized keys)
 */
function buildFieldDataFromRow(row: Record<string, string>) {
  const fieldData: Record<string, any> = {};

  for (const [csvKey, value] of Object.entries(row)) {
    const wfKey = FIELD_MAP[csvKey];
    if (!wfKey) continue;

    const v = String(value ?? "").trim();
    if (v === "") continue;

    fieldData[wfKey] = v;
  }

  return fieldData;
}

/**
 * Load ALL properties from Webflow (paginated) using PUBLIC client methods
 */
async function fetchAllProperties(client: WebflowClient): Promise<WebflowItem[]> {
  if (!PROPS_COLLECTION_ID) throw new Error("WEBFLOW_COLLECTION_PROPERTIES not set");

  const all: WebflowItem[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const page = await client.fetchItemsPage(PROPS_COLLECTION_ID, limit, offset);
    const items = Array.isArray(page?.items) ? (page.items as WebflowItem[]) : [];
    all.push(...items);

    const total = page.pagination?.total;
    if (typeof total === "number") {
      offset += items.length;
      if (offset >= total) break;
    } else {
      if (items.length < limit) break;
      offset += limit;
    }
  }

  return all;
}

/**
 * Resolve Webflow item id based on matchKey
 * matchKey supports: item_id | slug | name
 *
 * IMPORTANT:
 * - When matchKey=item_id, we read CSV row.item_id and match Webflow item.id
 */
function resolveItemId(
  matchKey: string,
  row: Record<string, string>,
  byId: Map<string, WebflowItem>,
  bySlug: Map<string, WebflowItem>,
  byName: Map<string, WebflowItem>
) {
  const mk = String(matchKey || "item_id");

  if (mk === "item_id") {
    const id = String(row.item_id || row.id || "").trim();
    // if it exists, ensure it matches an existing Webflow item
    const hit = id ? byId.get(id) : undefined;
    return hit?.id || null;
  }

  if (mk === "slug") {
    const slug = norm(row.slug);
    const hit = slug ? bySlug.get(slug) : undefined;
    return hit?.id || null;
  }

  if (mk === "name") {
    const name = norm(row.name);
    const hit = name ? byName.get(name) : undefined;
    return hit?.id || null;
  }

  return null;
}

/**
 * Core import handler for preview + apply
 */
async function handleImport(req: Request, res: Response, apply: boolean) {
  if (!WEBFLOW_TOKEN) return res.status(500).json({ error: "WEBFLOW_API_TOKEN not set" });
  if (!PROPS_COLLECTION_ID) return res.status(500).json({ error: "WEBFLOW_COLLECTION_PROPERTIES not set" });

  const file = (req as any).file as { buffer?: Buffer; originalname?: string } | undefined;
  if (!file?.buffer) return res.status(400).json({ error: "Missing CSV file (field name: file)" });

  // robust form-data parsing
  const matchKey = String(first(req.body?.matchKey) || "item_id");
  const tenantId = String(first(req.body?.tenantId) || "demo");
  const mode = String(first(req.body?.mode) || "update-only");
  const dryRun = qBool(req.body?.dryRun ?? "true");

  const willWrite = apply && !dryRun;

  const { headers, records } = csvToRows(file.buffer);
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const preview = records.slice(0, 10);

  // Load items once
  const client = new WebflowClient(WEBFLOW_TOKEN);
  const items = await fetchAllProperties(client);

  // Indexes
  const byId = new Map(items.map((x) => [String(x.id).trim(), x]));
  const bySlug = new Map(
    items
      .map((x) => [norm(x.fieldData?.slug), x] as const)
      .filter(([k]) => k)
  );
  const byName = new Map(
    items
      .map((x) => [norm(x.fieldData?.name), x] as const)
      .filter(([k]) => k)
  );

  const applied = {
    updated: 0,
    skipped: 0,
    missing: [] as any[],
    errors: [] as any[],
  };

  for (const row of records) {
    try {
      const itemId = resolveItemId(matchKey, row, byId, bySlug, byName);
      if (!itemId) {
        applied.missing.push({
          row,
          reason: `No match for matchKey=${matchKey}`,
        });
        continue;
      }

      const fieldData = buildFieldDataFromRow(row);

      if (!Object.keys(fieldData).length) {
        applied.skipped++;
        continue;
      }

      // preview/dry-run counts as "would update"
      if (!willWrite) {
        applied.updated++;
        continue;
      }

      // ✅ WRITE
      await client.patchItem(PROPS_COLLECTION_ID, itemId, fieldData);
      applied.updated++;
    } catch (e: any) {
      applied.errors.push({ row, error: e?.message || String(e) });
    }
  }

  return res.json({
    runId,
    summary: {
      rows: records.length,
      matchKey,
      tenantId,
      mode,
      dryRun,
      willWrite,
    },
    headers,
    preview,
    applied,
  });
}

/**
 * Routes
 *  - POST /api/import/properties/csv
 *  - POST /api/import/properties/csv/apply
 */
router.post("/import/properties/csv", requireAdmin, upload.single("file"), async (req, res) => {
  return handleImport(req, res, false);
});

router.post("/import/properties/csv/apply", requireAdmin, upload.single("file"), async (req, res) => {
  return handleImport(req, res, true);
});

export default router;