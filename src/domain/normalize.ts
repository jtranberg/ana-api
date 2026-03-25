// src/domain/normalize.ts
import type { CanonicalData, Property, Floorplan, Unit } from "./canonicalTypes.js";
import type { WebflowV2Item } from "../webflow/client.js";
import { WebflowClient } from "../webflow/client.js";

const FIELDS = {
  property: {
    nameRT: "property-name-rt",
    name: "property-name",
    subtext: "subtext",
    information: "information",
    description: "description",
    awards: "awards",

    cityName: "text-block-1",
    cityOptionId: "city",

    address1: "address-1",
    address2: "address-2",
    postal: "postal-code",

    mainImage: "main-property-image",
    support1: "property-support-image-1",
    support2: "property-support-image-2",
    support3: "property-support-image-3",

    lat: "latitude-2",
    lng: "longitude-2",

    rentalOrPurchase: "rental-or-purchase",
    unitsAvailableCount: "units-available-count",

    amenity1: "amenity-1",
    amenity2: "amenity-2",
    amenity3: "amenity-3",
    amenity4: "amenity-4",
    amenity5: "amenity-5",
    amenity6: "amenity-6",
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
  },
};

function fd(item: WebflowV2Item): Record<string, any> {
  return item.fieldData ?? {};
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function polishDescription(text: string): string {
  return text
    .replace(/\s*(Address:)/g, "\n$1")
    .replace(/\s*(Completion:)/g, "\n$1")
    .replace(/\s*(Community:)/g, "\n$1")
    .replace(/\s*(Features:)/g, "\n$1")
    .trim();
}

function asString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
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
    if (["true", "yes", "1", "available"].includes(s)) return true;
    if (["false", "no", "0", "unavailable"].includes(s)) return false;
  }
  if (typeof v === "number") return v !== 0;
  return undefined;
}

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

function warn(scope: "property" | "unit" | "floorplan", id: string, message: string) {
  console.warn(`[normalize:${scope}] ${id} - ${message}`);
}

function normalizeRegion(region: string, city: string): string {
  const raw = region.trim().toUpperCase();
  const cityNorm = city.trim();

  if (["Vancouver", "North Vancouver", "West Vancouver", "Richmond"].includes(cityNorm)) {
    return "BC";
  }

  const regionMap: Record<string, string> = {
    "BRITISH COLUMBIA": "BC",
    "ALBERTA": "AB",
    "SASKATCHEWAN": "SK",
    "MANITOBA": "MB",
    "ONTARIO": "ON",
    "QUEBEC": "QC",
    "NEW BRUNSWICK": "NB",
    "NOVA SCOTIA": "NS",
    "PRINCE EDWARD ISLAND": "PE",
    "NEWFOUNDLAND AND LABRADOR": "NL",
    "YUKON": "YT",
    "NORTHWEST TERRITORIES": "NT",
    "NUNAVUT": "NU",
  };

  return regionMap[raw] || raw || "BC";
}

function normalizePostal(postal: string): string {
  const cleaned = postal.toUpperCase().replace(/\s+/g, " ").trim();
  return cleaned || "V0V 0V0";
}

function extractAddressPartsFromDescription(descriptionHtml: string): {
  address1?: string;
  city?: string;
  region?: string;
  postal?: string;
} {
  const clean = stripHtml(descriptionHtml);
  const m = clean.match(/Address:\s*([^|]+?)(?:Postal Code:|$)/i);
  if (!m) return {};

  const full = m[1].trim();
  const parts = full.split(",").map((p) => p.trim()).filter(Boolean);

  const address1 = parts[0];
  const city = parts[1];

  let region: string | undefined;
  let postal: string | undefined;

  const tail = parts.slice(2).join(" ");

  const regionMatch = tail.match(/\b(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)\b/i);
  if (regionMatch) region = regionMatch[1].toUpperCase();

  const postalMatch = tail.match(/\b([A-Z]\d[A-Z][ -]?\d[A-Z]\d)\b/i);
  if (postalMatch) postal = postalMatch[1].toUpperCase();

  return { address1, city, region, postal };
}

function extractImageUrlsFromRichText(html: string): string[] {
  const s = asString(html);
  if (!s) return [];

  const urls = new Set<string>();

  for (const m of s.matchAll(/src=["'](https?:\/\/[^"']+)["']/gi)) {
    urls.add(m[1]);
  }

  for (const m of s.matchAll(
    /(https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp|gif))(?:[?#[^\s"'<>]]*)?/gi
  )) {
    urls.add(m[1]);
  }

  return [...urls];
}

function looksHashed(value: string): boolean {
  const s = value.trim();
  return /^[a-f0-9]{24,}$/i.test(s) || /^[a-f0-9-]{24,}$/i.test(s);
}

function buildFloorplanName(unitType: string, beds: number, baths: number, sqft?: number): string {
  const clean = unitType.trim();

  if (clean && !looksHashed(clean)) return clean;

  const bedLabel = beds === 0 ? "Studio" : `${beds} Bed`;
  const bathLabel = `${baths} Bath`;
  const sizeLabel = sqft ? ` • ${sqft} SF` : "";

  return `${bedLabel} / ${bathLabel}${sizeLabel}`;
}

function deriveStructureType(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();

  if (text.includes("townhome") || text.includes("townhouse")) return "Townhome";
  if (text.includes("high-rise") || text.includes("high rise")) return "High Rise";
  if (text.includes("mid-rise") || text.includes("mid rise")) return "Mid Rise";
  if (text.includes("garden")) return "Garden Style";

  return "Apartment";
}

function buildFallbackProperty(): Property {
  return {
    propertyId: "fallback-property",
    name: "Fallback Property",
    address1: "Address Pending",
    city: "Unknown City",
    region: "BC",
    postal: "V0V 0V0",
    country: "CA",
    lat: 49.2827,
    lng: -123.1207,
    description: "Auto-generated fallback property for unmapped units.",
    amenities: [],
    images: [],
    structureType: "Apartment",
    unitCount: 0,
  };
}

export async function getCanonicalFromWebflow(): Promise<CanonicalData> {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error("Missing WEBFLOW_API_TOKEN");

  const propertiesCollectionId = process.env.WEBFLOW_COLLECTION_PROPERTIES;
  const unitsCollectionId = process.env.WEBFLOW_COLLECTION_UNITS;

  if (!propertiesCollectionId) throw new Error("Missing WEBFLOW_COLLECTION_PROPERTIES");
  if (!unitsCollectionId) throw new Error("Missing WEBFLOW_COLLECTION_UNITS");

  const client = new WebflowClient(token);

  const propertiesRaw = await client.fetchAllItems(propertiesCollectionId, {
    includeDrafts: true,
    includeArchived: true,
  });

  const unitsRaw = await client.fetchAllItems(unitsCollectionId, {
    includeDrafts: true,
    includeArchived: true,
  });

  const properties: Property[] = propertiesRaw.map((p) => {
    const d = fd(p);
    const descriptionHtml = asString(d[FIELDS.property.description]);
    const parsedAddr = extractAddressPartsFromDescription(descriptionHtml);

    const images = uniqStrings(
      [
        extractImageUrl(d[FIELDS.property.mainImage]),
        extractImageUrl(d[FIELDS.property.support1]),
        extractImageUrl(d[FIELDS.property.support2]),
        extractImageUrl(d[FIELDS.property.support3]),
        extractImageUrl(d["main-image"]),
        extractImageUrl(d["featured-image"]),
        extractImageUrl(d["thumbnail-image"]),
        extractImageUrl(d["gallery-image-1"]),
        extractImageUrl(d["gallery-image-2"]),
        extractImageUrl(d["gallery-image-3"]),
        ...extractImageUrlsFromRichText(descriptionHtml),
      ].filter(Boolean) as string[]
    );

    const address1 = firstNonEmpty(
      pickTextField(d, [FIELDS.property.address1]),
      pickTextField(d, ["street-address", "address1", "address", "street"]),
      parsedAddr.address1,
      "Address Pending"
    );

    const address2 = firstNonEmpty(
      pickTextField(d, [FIELDS.property.address2]),
      pickTextField(d, ["address-2", "address2", "suite", "unit"])
    );

    const city = firstNonEmpty(
      pickTextField(d, [FIELDS.property.cityName]),
      pickTextField(d, ["city-name", "city", "location-city", "market-city"]),
      parsedAddr.city,
      "Unknown City"
    );

    const rawRegion = firstNonEmpty(
      pickTextField(d, ["region", "province", "state", "province-state"]),
      parsedAddr.region
    );

    const region = normalizeRegion(rawRegion, city);

    const rawPostal = firstNonEmpty(
      pickTextField(d, [FIELDS.property.postal]),
      pickTextField(d, ["postal", "zip", "zip-code", "postal-code", "postcode"]),
      parsedAddr.postal
    );

    const postal = normalizePostal(rawPostal);

    const name = firstNonEmpty(
      stripHtml(asString(d[FIELDS.property.nameRT])),
      stripHtml(asString(d["name"])),
      stripHtml(asString(d[FIELDS.property.name])),
      `Property-${p.id}`
    );

    const lat = asNumber(d[FIELDS.property.lat]) ?? 49.2827;
    const lng = asNumber(d[FIELDS.property.lng]) ?? -123.1207;
    const description = polishDescription(stripHtml(descriptionHtml)) || "Description pending.";
    const structureType = deriveStructureType(name, description);

    return {
      propertyId: p.id,
      name,
      address1,
      address2: address2 || undefined,
      city,
      region,
      postal,
      country: "CA",
      lat,
      lng,
      phone: undefined,
      email: undefined,
      website: undefined,
      description,
      amenities: [
        asString(d[FIELDS.property.amenity1]),
        asString(d[FIELDS.property.amenity2]),
        asString(d[FIELDS.property.amenity3]),
        asString(d[FIELDS.property.amenity4]),
        asString(d[FIELDS.property.amenity5]),
        asString(d[FIELDS.property.amenity6]),
      ].filter(Boolean),
      images,
      structureType,
      unitCount: 0,
    };
  });

  if (properties.length === 0) {
    warn("property", "system", "no properties returned from CMS → creating fallback property");
    properties.push(buildFallbackProperty());
  }

  const propertyById = new Map(properties.map((x) => [x.propertyId, x]));
  const floorplans: Floorplan[] = [];
  const floorplanKeyToId = new Map<string, string>();
  const units: Unit[] = [];

  for (const u of unitsRaw) {
    const d = fd(u);

    let propertyId = extractRefId(d[FIELDS.unit.propertyRef]) ?? "";
    if (!propertyId || !propertyById.has(propertyId)) {
      warn("unit", u.id, "missing or invalid propertyRef → fallback property assigned");
      propertyId = properties[0]?.propertyId ?? "fallback-property";
    }

    let available = asBool(d[FIELDS.unit.available]);
    if (available === undefined) {
      available = true;
      warn("unit", u.id, "missing available flag → default TRUE");
    }

    let rentVal =
      asNumber(d[FIELDS.unit.rent]) ??
      asNumber(d["rent"]) ??
      asNumber(d["price"]);

    if (rentVal == null || rentVal < 0) {
      rentVal = 0;
      warn("unit", u.id, "missing/invalid rent → fallback 0");
    }

    const beds = asNumber(d[FIELDS.unit.beds]) ?? 0;
    const baths = asNumber(d[FIELDS.unit.baths]) ?? 0;
    const sqft = asNumber(d[FIELDS.unit.sqft]) ?? 0;

    const rawUnitType = asString(d[FIELDS.unit.unitType] ?? "Unit") || "Unit";
    const floorplanName = buildFloorplanName(rawUnitType, beds, baths, sqft);

    const fpKey = `${propertyId}|${floorplanName}|${beds}|${baths}|${sqft}`;

    let floorplanId = floorplanKeyToId.get(fpKey);
    if (!floorplanId) {
      floorplanId = `fp_${floorplanKeyToId.size + 1}`;
      floorplanKeyToId.set(fpKey, floorplanId);

      const inheritedImages = propertyById.get(propertyId)?.images;

      floorplans.push({
        floorplanId,
        propertyId,
        name: floorplanName,
        beds,
        baths,
        sqftMin: sqft,
        sqftMax: sqft,
        images:
          inheritedImages && inheritedImages.length
            ? uniqStrings(inheritedImages).slice(0, 8)
            : undefined,
        unitCount: 0,
        unitsAvailable: 0,
      });
    }

    let availableDate = toIsoDateOnly(d[FIELDS.unit.availableDate]);
    if (!availableDate) {
      availableDate = new Date().toISOString().slice(0, 10);
      warn("unit", u.id, "missing availableDate → using today");
    }

    const updated = u.lastUpdated ? new Date(u.lastUpdated).toISOString() : isoNow();
    const inheritedUnitImages = propertyById.get(propertyId)?.images;

    units.push({
      unitId: u.id,
      propertyId,
      floorplanId,
      unitNumber: asString(d[FIELDS.unit.unitNumber]) || `Unit-${u.id}`,
      rent: rentVal,
      rentMax: undefined,
      available,
      availableDate,
      images:
        inheritedUnitImages && inheritedUnitImages.length
          ? uniqStrings(inheritedUnitImages).slice(0, 8)
          : undefined,
      lastUpdated: updated,
      sqftMin: sqft,
      sqftMax: sqft,
      occupancyStatus: available ? "Vacant" : "Occupied",
      leasedStatus: available ? "Available" : "Leased",
      vacancyClass: available ? "Unoccupied" : "Occupied",
    });
  }

  const floorplanById = new Map(floorplans.map((fp) => [fp.floorplanId, fp]));

  for (const unit of units) {
    const property = propertyById.get(unit.propertyId);
    if (property) {
      property.unitCount = (property.unitCount ?? 0) + 1;
    }

    const fp = floorplanById.get(unit.floorplanId);
    if (fp) {
      fp.unitCount = (fp.unitCount ?? 0) + 1;
      if (unit.available) {
        fp.unitsAvailable = (fp.unitsAvailable ?? 0) + 1;
      }
    }
  }

  if (units.length === 0) {
    warn("unit", "system", "no units returned from CMS");
  }

  console.log("CANONICAL COUNTS", {
    properties: properties.length,
    floorplans: floorplans.length,
    units: units.length,
  });

  return { properties, floorplans, units };
}