// src/domain/normalize.ts
import type { CanonicalData, Property, Floorplan, Unit } from "./canonicalTypes.js";
import type { WebflowV2Item } from "../webflow/client.js";
import { WebflowClient } from "../webflow/client.js";

/**
 * Webflow field keys (as they appear in fieldData).
 * Update these slugs if your Webflow CMS uses different ones.
 */
const FIELDS = {
  // Properties collection fields (v2 slugs)
  property: {
    // Rich text / text
    nameRT: "property-name-rt", // e.g. "<p>Peter Wall Yorkshire</p>"
    name: "property-name", // marketing line (often rich text)
    subtext: "subtext",
    information: "information",
    description: "description",
    awards: "awards",

    // City name appears to be stored in text-block-1 (e.g. "<p>Vancouver</p>")
    cityName: "text-block-1",

    // City option id also exists (optional; map later if you want)
    cityOptionId: "city",

    /**
     * ✅ Address fields (ADD THESE IN WEBFLOW CMS ASAP)
     * These are best-guess slugs. We also do fallback lookups below.
     */
    address1: "address-1",
    address2: "address-2",
    postal: "postal-code",

    // Images
    mainImage: "main-property-image",
    support1: "property-support-image-1",
    support2: "property-support-image-2",
    support3: "property-support-image-3",

    // Lat/Lng are strings in your CMS
    lat: "latitude-2",
    lng: "longitude-2",

    // Misc
    rentalOrPurchase: "rental-or-purchase",
    unitsAvailableCount: "units-available-count",

    // Amenities are references/ids (optional)
    amenity1: "amenity-1",
    amenity2: "amenity-2",
    amenity3: "amenity-3",
    amenity4: "amenity-4",
    amenity5: "amenity-5",
    amenity6: "amenity-6",
  },

  // Units collection fields (v2 slugs)
  unit: {
    // ✅ confirmed from your /units-sample debug
    propertyRef: "property-2",
    unitNumber: "unit-number",
    available: "available",
    unitType: "unit-type",
    sqft: "square-footage",

    // ⚠️ not seen in your sample yet (confirm later)
    availableDate: "availability-date",
    rent: "rent-price",
    beds: "beds",
    baths: "baths",

    /**
     * OPTIONAL (if you later add):
     * unitMainImage: "unit-main-image",
     * unitSupport1: "unit-support-image-1",
     * etc...
     */
  },
};

function fd(item: WebflowV2Item): Record<string, any> {
  return item.fieldData ?? {};
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function asString(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function asNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function asBool(v: unknown): boolean | undefined {
  if (v === true || v === false) return v;
  if (v == null) return undefined;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "yes", "1"].includes(s)) return true;
    if (["false", "no", "0"].includes(s)) return false;
  }
  return undefined;
}

/**
 * Webflow reference fields (v2) commonly come back as:
 * - string id
 * - array of string ids
 * - object with id
 * - array of objects with id
 */
function extractRefId(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.id) return String(value.id);
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first?.id) return String(first.id);
  }
  return undefined;
}

/**
 * Webflow assets may come back as:
 * - { url: "https://..." }
 * - "https://..."
 * - sometimes arrays of either (rare)
 */
function extractImageUrl(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v.startsWith("http") ? v : undefined;
  const url = v?.url;
  return typeof url === "string" && url.startsWith("http") ? url : undefined;
}

function isoNow(): string {
  return new Date().toISOString();
}

function toIsoDateOnly(v: unknown): string | undefined {
  if (!v) return undefined;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function firstNonEmpty(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const s = (v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function pickTextField(d: Record<string, any>, slugs: string[]): string {
  for (const slug of slugs) {
    const raw = d?.[slug];
    const text = stripHtml(asString(raw));
    if (text) return text;
  }
  return "";
}

function uniqStrings(arr: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of arr) {
    const key = s.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * TEMP PATCH (REMOVE AFTER WEBFLOW CMS UPDATE)
 * Extract Address fields from HTML-ish "description" rich text:
 * Example: "<p><strong>Address:</strong> 2336 York Ave, Vancouver, BC</p>..."
 *
 * ✅ After CMS update:
 * - add explicit fields: address1, city, region, postal
 * - then delete this helper and map directly from fieldData
 */
function extractAddressPartsFromDescription(descriptionHtml: string): {
  address1?: string;
  city?: string;
  region?: string;
  postal?: string;
} {
  const clean = stripHtml(descriptionHtml);

  // Try to find a chunk starting with "Address:"
  const m = clean.match(/Address:\s*([^\n\r]+)/i);
  if (!m) return {};

  const full = m[1].trim(); // "2336 York Ave, Vancouver, BC"
  const parts = full.split(",").map((p) => p.trim()).filter(Boolean);

  const address1 = parts[0];
  const city = parts[1];

  //postal code 
  const region = parts[2] || "BC";

  return { address1, city, region };
}

/**
 * TEMP PATCH
 * If your property images are embedded in rich text, pull URLs out.
 * This helps unblock the "min 3 images" requirement immediately.
 */
function extractImageUrlsFromRichText(html: string): string[] {
  const s = asString(html);
  if (!s) return [];
  const urls = new Set<string>();

  // src="https://..."
  for (const m of s.matchAll(/src=["'](https?:\/\/[^"']+)["']/gi)) {
    urls.add(m[1]);
  }
  // plain https://....(jpg/png/webp/etc)
  for (const m of s.matchAll(/(https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp|gif))(?:[?#[^\s"'<>]]*)?/gi)) {
    urls.add(m[1]);
  }

  return [...urls];
}

export async function getCanonicalFromWebflow(): Promise<CanonicalData> {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error("Missing WEBFLOW_API_TOKEN");

  const propertiesCollectionId = process.env.WEBFLOW_COLLECTION_PROPERTIES;
  const unitsCollectionId = process.env.WEBFLOW_COLLECTION_UNITS;

  if (!propertiesCollectionId) throw new Error("Missing WEBFLOW_COLLECTION_PROPERTIES");
  if (!unitsCollectionId) throw new Error("Missing WEBFLOW_COLLECTION_UNITS");

  const client = new WebflowClient(token);

  // ✅ Properties: normal (live-only)
  const propertiesRaw = await client.fetchAllItems(propertiesCollectionId);

  /**
   * TEMP DEBUG (REMOVE AFTER CONFIRMED)
   * Pull EVERYTHING (draft + archived) so we can confirm units exist.
   * ✅ After CMS is stable, switch back to live-only fetch (no includeDrafts/includeArchived).
   */
  const unitsRaw = await client.fetchAllItems(unitsCollectionId, {
    includeDrafts: true,
    includeArchived: true,
  });

  // ---- Properties ----
  const properties: Property[] = propertiesRaw.map((p) => {
    const d = fd(p);

    const descriptionHtml = asString(d[FIELDS.property.description]);
    const parsedAddr = extractAddressPartsFromDescription(descriptionHtml);

    // ✅ Images: known slugs + extra fallbacks + rich text scraping
    const images = uniqStrings(
      [
        extractImageUrl(d[FIELDS.property.mainImage]),
        extractImageUrl(d[FIELDS.property.support1]),
        extractImageUrl(d[FIELDS.property.support2]),
        extractImageUrl(d[FIELDS.property.support3]),

        // TEMP FALLBACKS (remove once Webflow slugs are confirmed)
        extractImageUrl(d["main-image"]),
        extractImageUrl(d["featured-image"]),
        extractImageUrl(d["thumbnail-image"]),
        extractImageUrl(d["gallery-image-1"]),
        extractImageUrl(d["gallery-image-2"]),
        extractImageUrl(d["gallery-image-3"]),
        ...extractImageUrlsFromRichText(descriptionHtml),
      ].filter(Boolean) as string[]
    );

    // ✅ Address / City / Postal: prefer explicit fields, then fallbacks, then parsed-from-description
    const address1 = firstNonEmpty(
      pickTextField(d, [FIELDS.property.address1]),
      pickTextField(d, ["street-address", "address1", "address", "street"]),
      parsedAddr.address1
    );

    const city = firstNonEmpty(
      pickTextField(d, [FIELDS.property.cityName]),
      pickTextField(d, ["city-name", "city", "location-city", "market-city"]),
      parsedAddr.city
    );

    const postal = firstNonEmpty(
      pickTextField(d, [FIELDS.property.postal]),
      pickTextField(d, ["postal", "zip", "zip-code", "postal-code"]),
      parsedAddr.postal
    );

    return {
      propertyId: p.id,

      // Use property-name-rt first (clean), then fieldData.name, then marketing line
      name:
        stripHtml(asString(d[FIELDS.property.nameRT])) ||
        stripHtml(asString(d["name"])) ||
        stripHtml(asString(d[FIELDS.property.name])) ||
        "",

      /**
       * ✅ REQUIRED FIELDS FOR FEED VALIDATOR
       * TEMP: if Webflow is missing them, we fallback to description parsing or blank.
       *
       * After CMS update:
       * - remove parsedAddr helper
       * - map directly from explicit CMS fields only
       */
      address1: address1 || "",
      address2: pickTextField(d, [FIELDS.property.address2]) || undefined,

      city: city || "",

      // Keep BC here as province/state for address fields.
      // (Your "Region" in the XML should NOT be used for marketing text.)
      region: parsedAddr.region || "BC",

      // TEMP: if still empty, use placeholder until CMS adds it
      postal: postal || "V0V 0V0",
      country: "CA",

      lat: asNumber(d[FIELDS.property.lat]),
      lng: asNumber(d[FIELDS.property.lng]),

      phone: undefined,
      email: undefined,
      website: undefined,

      description: stripHtml(descriptionHtml) || undefined,

      // These are currently IDs; later you can deref them via a "Building details" collection
      amenities: [
        asString(d[FIELDS.property.amenity1]),
        asString(d[FIELDS.property.amenity2]),
        asString(d[FIELDS.property.amenity3]),
        asString(d[FIELDS.property.amenity4]),
        asString(d[FIELDS.property.amenity5]),
        asString(d[FIELDS.property.amenity6]),
      ].filter(Boolean),

      images,
    };
  });

  const propertyById = new Map(properties.map((x) => [x.propertyId, x]));

  // ---- Synthetic Floorplans (generated from units) ----
  const floorplans: Floorplan[] = [];
  const floorplanKeyToId = new Map<string, string>();
  const units: Unit[] = [];

  for (const u of unitsRaw) {
    const d = fd(u);

    const propertyId = extractRefId(d[FIELDS.unit.propertyRef]) ?? "";

    /**
     * TEMP PATCH (REMOVE AFTER WEBFLOW CMS UPDATE)
     * rent is missing from Webflow units right now, causing ALL listings to be blocked.
     *
     * ✅ After CMS update:
     * - add a real numeric rent field in Units
     * - remove the fallback-to-1
     */
    let rent = asNumber(d[FIELDS.unit.rent]);
    if (!rent || rent <= 0) rent = 1;

    const beds = asNumber(d[FIELDS.unit.beds]);
    const baths = asNumber(d[FIELDS.unit.baths]);
    const sqft = asNumber(d[FIELDS.unit.sqft]);

    const unitType = asString(d[FIELDS.unit.unitType] ?? "Unit");

    // synthetic floorplan key
    const fpKey = `${propertyId}|${unitType}|${beds ?? "?"}|${baths ?? "?"}|${sqft ?? "?"}`;

    let floorplanId = floorplanKeyToId.get(fpKey);
    if (!floorplanId) {
      floorplanId = `fp_${floorplanKeyToId.size + 1}`;
      floorplanKeyToId.set(fpKey, floorplanId);

      // TEMP: if you don’t have floorplan images, inherit property images (helps unblock min image rules)
      const inheritedImages = propertyById.get(propertyId)?.images;
      floorplans.push({
        floorplanId,
        propertyId,
        name: unitType,
        beds: beds ?? 0,
        baths: baths ?? 0,
        sqftMin: sqft,
        sqftMax: sqft,
        images: inheritedImages && inheritedImages.length ? inheritedImages : undefined,
      });
    }

    const available = asBool(d[FIELDS.unit.available]) ?? false;
    const availableDate = toIsoDateOnly(d[FIELDS.unit.availableDate]);
    const updated = u.lastUpdated ? new Date(u.lastUpdated).toISOString() : isoNow();

    // TEMP: inherit property images onto units if unit images aren’t mapped yet
    const inheritedUnitImages = propertyById.get(propertyId)?.images;

    units.push({
      unitId: u.id,
      propertyId,
      floorplanId,
      unitNumber: asString(d[FIELDS.unit.unitNumber]) || undefined,
      rent,
      rentMax: undefined,
      available,
      availableDate,
      images: inheritedUnitImages && inheritedUnitImages.length ? inheritedUnitImages : undefined,
      lastUpdated: updated,
    });
  }

  // keep only units that reference a known property
  const cleanedUnits = units.filter((u) => u.propertyId && propertyById.has(u.propertyId) && u.floorplanId);

  return { properties, floorplans, units: cleanedUnits };
}
