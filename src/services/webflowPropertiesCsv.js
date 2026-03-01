// src/services/webflowPropertiesCsv.js
/**
 * Webflow Properties collection (v2) — CSV bulk update (update-only)
 *
 * Required env:
 *   WEBFLOW_API_TOKEN
 *   WEBFLOW_COLLECTION_PROPERTIES=<your properties collection id>
 *
 * We assume your CSV headers get normalized like your importer does:
 *   "Item ID" -> "item_id"
 *   "Property Name RT" -> "property_name_rt"
 *   "Main property image" -> "main_property_image"
 *   "Units available count" -> "units_available_count"
 *
 * ✅ Recommended matchKey: "item_id"
 */

const PROPERTIES_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_PROPERTIES;
const TOKEN = process.env.WEBFLOW_API_TOKEN;

const API_BASE = "https://api.webflow.com/v2";

// --------------------------
// Utils
// --------------------------
function assertEnv() {
  if (!TOKEN) throw new Error("Missing WEBFLOW_API_TOKEN env var");
  if (!PROPERTIES_COLLECTION_ID)
    throw new Error("Missing WEBFLOW_COLLECTION_PROPERTIES env var");
}

function slugify(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return undefined;
}

function toNumber(v) {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toStringClean(v) {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

// --------------------------
// Webflow fetch wrapper
// --------------------------
async function webflowFetch(path, { method = "GET", query, body } = {}) {
  assertEnv();

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
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      "Content-Type": body ? "application/json" : undefined,
      "accept-version": "2.0.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const details =
      data?.message ||
      data?.error ||
      data?.msg ||
      (typeof data === "string" ? data : "") ||
      res.statusText;

    const err = new Error(`Webflow API error ${res.status}: ${details}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

// --------------------------
// PATCH helper
// --------------------------
async function patchWebflowPropertyItem({ itemId, fieldData }) {
  return webflowFetch(`/collections/${PROPERTIES_COLLECTION_ID}/items/${itemId}`, {
    method: "PATCH",
    body: { fieldData },
  });
}

// --------------------------
// CSV row -> Webflow fieldData patch
// --------------------------
//
// IMPORTANT:
// The keys on the LEFT must match your Webflow *field slugs*.
// The keys on the RIGHT are your normalized CSV headers.
//
// If any of these slugs differ in your collection, change them here.
//
// ✅ RISKY fields are commented out for now to avoid Webflow 400 Validation Errors.
//    We'll add them back one group at a time once we confirm the safe patch works.
//
function buildPatchFromRow(r) {
  const patch = {};

  // ✅ SAFE: plain text fields that almost always exist
  const name = toStringClean(r.name);
  if (name) patch["name"] = name;

  const slug = toStringClean(r.slug);
  if (slug) patch["slug"] = slugify(slug);

  // ✅ OPTIONAL SAFE: only keep this if your Webflow field slug is truly "city" and it’s PlainText
  const city = toStringClean(r.city);
  if (city) patch["city"] = city;

  // --------------------------
  // 🚫 RISKY FIELDS (commented out until we verify exact slugs + field types)
  // --------------------------

  // Rich text / copy blocks
  const propertyNameRT = toStringClean(r.property_name_rt);
  if (propertyNameRT) patch["property-name-rt"] = propertyNameRT;

  const subtext = toStringClean(r.property_subtext);
  if (subtext) patch["subtext"] = subtext;

  const information = toStringClean(r.information);
  if (information) patch["information"] = information;

  const description = toStringClean(r.description);
  if (description) patch["description"] = description;

  // const tagline = toStringClean(r.tagline_text);
  // if (tagline) patch["tagline-text"] = tagline;

  // const cityName = toStringClean(r.city_name);
  // if (cityName) patch["city-name"] = cityName;

  // Numbers / coords
  // const lat = toNumber(r.latitude);
  // if (lat !== undefined) patch["latitude"] = lat;

  // const lng = toNumber(r.longitude);
  // if (lng !== undefined) patch["longitude"] = lng;


// if (lat !== undefined && lng !== undefined) {
//   patch["location"] = { latitude: lat, longitude: lng }; // or { lat, lng } depending on Webflow
// }

  const unitsCount = toNumber(r.units_available_count);
  if (unitsCount !== undefined) patch["units-available-count"] = unitsCount;

  // Booleans
  // const purchase = toBool(r.purchase);
  // if (purchase !== undefined) patch["purchase"] = purchase;

  // const commercial = toBool(r.commercial_property);
  // if (commercial !== undefined) patch["commercial-property"] = commercial;

  const rental = toBool(r.rental_property);
  if (rental !== undefined) patch["rental-property"] = rental;

  // Images
  const mainImg = toStringClean(r.main_property_image);
  if (mainImg) patch["main-property-image"] = mainImg;

  const sup1 = toStringClean(r.property_support_image_1);
  if (sup1) patch["property-support-image-1"] = sup1;

  const sup2 = toStringClean(r.property_support_image_2);
  if (sup2) patch["property-support-image-2"] = sup2;

  const sup3 = toStringClean(r.property_support_image_3);
  if (sup3) patch["property-support-image-3"] = sup3;

  // Amenities
  // for (let i = 1; i <= 6; i++) {
  //   const v = toStringClean(r[`amenity_${i}`]);
  //   if (v) patch[`amenity-${i}`] = v;
  // }

  // Clean empties
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined || v === null) delete patch[k];
    if (typeof v === "number" && Number.isNaN(v)) delete patch[k];
    if (typeof v === "string" && v.trim() === "") delete patch[k];
  }

  return patch;
}
/**
 * UPDATE-ONLY bulk apply for Webflow Properties.
 * matchKey MUST be "item_id" for safety and accuracy.
 */
export async function applyWebflowPropertiesUpdateOnly({ tenantId, matchKey, rows }) {
  if (matchKey !== "item_id") {
    throw new Error(
      `applyWebflowPropertiesUpdateOnly supports matchKey=item_id only (got ${matchKey})`
    );
  }

  let updated = 0;
  let skipped = 0;
  const missing = [];
  const errors = [];

  for (const r of rows) {
    const itemId = String(r.item_id ?? "").trim();

    if (!itemId) {
      skipped++;
      missing.push({ item_id: "", reason: "Missing item_id" });
      continue;
    }

    const patch = buildPatchFromRow(r);
    if (!Object.keys(patch).length) {
      skipped++;
      continue;
    }

    try {
      await patchWebflowPropertyItem({ itemId, fieldData: patch });
      updated++;
    } catch (e) {
      const msg = e?.message || String(e);
      const low = msg.toLowerCase();

      if (
        low.includes("not found") ||
        low.includes("invalid") ||
        low.includes("does not exist")
      ) {
        missing.push({ item_id: itemId, reason: msg });
      } else {
        errors.push({ item_id: itemId, error: msg });
      }
    }
  }

  return { tenantId, matchKey, updated, skipped, missing, errors };
}