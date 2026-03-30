
// src/domain/normalize.ts
import type { CanonicalData, Property, Floorplan, Unit } from "./canonicalTypes.js";
import type { WebflowV2Item } from "../webflow/client.js";
import { WebflowClient } from "../webflow/client.js";

/* =========================
   FIELD MAP
========================= */

const FIELDS = {
  property: {
    nameRT: "property-name-rt",
    name: "property-name",
    description: "description",
    address1: "address-1",
    address2: "address-2",
    postal: "postal-code",
    cityName: "text-block-1",
    slug: "slug",
  },
  unit: {
    propertyRef: "property-2",
    unitNumber: "unit-number",
    available: "available",
    unitType: "unit-type",
    sqft: "square-footage",
    availableDate: "availability-date",
    rent: "rent",
    beds: "bedrooms",
    baths: "bathrooms",
    slug: "slug",
  },
};

/* =========================
   HELPERS
========================= */

const fd = (item: WebflowV2Item) => item.fieldData ?? {};
const asString = (v: unknown) => (v == null ? "" : String(v).trim());
const asNumber = (v: unknown) => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const asBool = (v: unknown) => {
  if (v === true || v === false) return v;
  if (typeof v === "string") return ["true", "yes", "1"].includes(v.toLowerCase());
  return undefined;
};
const isoNow = () => new Date().toISOString();
const toIsoDateOnly = (v: unknown) => {
  if (!v) return undefined;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};
const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];

function warn(scope: string, id: string, msg: string) {
  console.warn(`[normalize:${scope}] ${id} - ${msg}`);
}

/* =========================
   MAIN
========================= */

export async function getCanonicalFromWebflow(): Promise<CanonicalData> {
  const client = new WebflowClient(process.env.WEBFLOW_API_TOKEN!);

  const propertiesRaw = await client.fetchAllItems(
    process.env.WEBFLOW_COLLECTION_PROPERTIES!,
    { includeDrafts: true, includeArchived: true }
  );

  const unitsRaw = await client.fetchAllItems(
    process.env.WEBFLOW_COLLECTION_UNITS!,
    { includeDrafts: true, includeArchived: true }
  );

  /* =========================
     PROPERTIES
  ========================= */

  const properties: Property[] = propertiesRaw.map((p) => {
    const d = fd(p);

    return {
      propertyId: p.id,
      name: asString(d[FIELDS.property.name]) || `Property-${p.id}`,
      address1: asString(d[FIELDS.property.address1]) || "Address Pending",
      address2: asString(d[FIELDS.property.address2]) || undefined,
      city: asString(d[FIELDS.property.cityName]) || "Unknown City",
      region: "BC",
      postal: asString(d[FIELDS.property.postal]) || "V0V 0V0",
      country: "CA",
      description: asString(d[FIELDS.property.description]) || "",
      images: [],
      unitCount: 0,
      propertyPageSlug: asString(d[FIELDS.property.slug]) || undefined,
    };
  });

  const propertyById = new Map(properties.map((p) => [p.propertyId, p]));

  /* =========================
     FLOORPLANS + UNITS
  ========================= */

  const floorplans: Floorplan[] = [];
  const floorplanMap = new Map<string, string>();
  const units: Unit[] = [];

  for (const u of unitsRaw) {
    const d = fd(u);

    const propertyId = asString(d[FIELDS.unit.propertyRef]);
    if (!propertyId || !propertyById.has(propertyId)) continue;

    const unitNumber = asString(d[FIELDS.unit.unitNumber]) || `Unit-${u.id}`;
    const rawSlug = asString(d[FIELDS.unit.slug]);

    /* 🔥 FIXED SLUG VALIDATION */
    const safeSlug =
      rawSlug && unitNumber && rawSlug.includes(unitNumber)
        ? rawSlug
        : undefined;

    if (rawSlug && !safeSlug) {
      warn("unit", u.id, `slug mismatch → ${rawSlug} vs ${unitNumber}`);
    }

    const rent = asNumber(d[FIELDS.unit.rent]);
    const beds = asNumber(d[FIELDS.unit.beds]) ?? 0;
    const baths = asNumber(d[FIELDS.unit.baths]) ?? 1;
    const sqft = asNumber(d[FIELDS.unit.sqft]) ?? 0;

    const fpKey = `${propertyId}-${beds}-${baths}-${sqft}`;

    let floorplanId = floorplanMap.get(fpKey);
    if (!floorplanId) {
      floorplanId = `fp_${floorplanMap.size + 1}`;
      floorplanMap.set(fpKey, floorplanId);

      floorplans.push({
        floorplanId,
        propertyId,
        name: `${beds} Bed / ${baths} Bath`,
        beds,
        baths,
        sqftMin: sqft,
        sqftMax: sqft,
      });
    }

    const availableDate =
      toIsoDateOnly(d[FIELDS.unit.availableDate]) ||
      new Date().toISOString().slice(0, 10);

    units.push({
      unitId: u.id,
      propertyId,
      floorplanId,

      unitNumber,
      unitType: asString(d[FIELDS.unit.unitType]),

      rent,
      available: asBool(d[FIELDS.unit.available]) ?? true,
      availableDate,

      lastUpdated: isoNow(),

      unitPageSlug: safeSlug, // ✅ FIXED

      sqftMin: sqft,
      sqftMax: sqft,
    });
  }

  return { properties, floorplans, units };
}

