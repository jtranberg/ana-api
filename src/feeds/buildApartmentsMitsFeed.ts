import type { CanonicalData, Floorplan, Property, Unit } from "../domain/canonicalTypes";
import { createXmlRoot, xmlToString } from "./xmlWriter";

export type ApartmentsFeedBuild = {
  xml: string;
  recordCount: number;
  blockedCount: number;
  blockedSample: Array<{ unitId: string; reasons: string[] }>;
};

/* =========================
   HELPERS
========================= */

function text(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function money(v: unknown, fallback = "0.00"): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

function sanitizeId(v: string | undefined, fallback: string): string {
  const s = (v || "").trim();
  return s || fallback;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function toDateParts(isoLike?: string) {
  if (!isoLike) return null;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;

  return {
    Year: String(d.getUTCFullYear()),
    Month: String(d.getUTCMonth() + 1),
    Day: String(d.getUTCDate()),
  };
}

function looksLikeImageUrl(url: string): boolean {
  const s = (url || "").trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://");
}

function safeImages(images: string[]): string[] {
  return images.filter(looksLikeImageUrl).slice(0, 20);
}

function validPostal(postal?: string | null): boolean {
  const p = (postal || "").trim().toUpperCase();
  return Boolean(p) && p !== "V0V 0V0";
}

function validDescription(desc?: string | null): boolean {
  const d = (desc || "").trim();
  return Boolean(d) && d !== "Description pending.";
}

/* =========================
   URL BUILDERS
========================= */

const SITE_BASE =
  process.env.PUBLIC_SITE_BASE_URL || "https://www.wallfinancialcorporation.com";

function buildUnitAvailabilityURL(_property: Property, unit: Unit): string {
  if (unit.unitPageSlug?.trim()) {
    return `${SITE_BASE}/units/${unit.unitPageSlug.trim()}`;
  }
  return "";
}

function buildPropertyAvailabilityURL(property: Property): string {
  if (property.propertyPageSlug?.trim()) {
    return `${SITE_BASE}/properties/${property.propertyPageSlug.trim()}`;
  }
  return "";
}

/* =========================
   IMAGE MERGE
========================= */

function mergeUnitImages(unit: Unit, fp?: Floorplan, property?: Property): string[] {
  return unique([
    ...(unit.images || []),
    ...(fp?.images || []),
    ...(property?.images || []),
  ]).slice(0, 20);
}

/* =========================
   MAIN BUILDER
========================= */

export function buildApartmentsMitsFeed(data: CanonicalData): ApartmentsFeedBuild {
  const floorplanById = new Map(data.floorplans.map((f) => [f.floorplanId, f]));

  const unitsByProperty = new Map<string, Unit[]>();
  for (const u of data.units) {
    (unitsByProperty.get(u.propertyId) ||
      unitsByProperty.set(u.propertyId, []).get(u.propertyId))!.push(u);
  }

  const root = createXmlRoot("Feed");
  root.att("xmlns", "http://www.mitsproject.org/schema/2009");
  root.att("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");

  let recordCount = 0;

  for (const property of data.properties) {
    const propertyUnits = unitsByProperty.get(property.propertyId) || [];
    if (!propertyUnits.length) continue;

    const propertyNode = root.ele("PhysicalProperty").ele("Property");

    propertyNode.att("IDValue", sanitizeId(property.propertyId, "property-id"));
    propertyNode.att("IDType", "PrimaryID");

    const propertyIdNode = propertyNode.ele("PropertyID");

    propertyIdNode
      .ele("Identification")
      .att("IDValue", property.propertyId)
      .att("IDType", "PrimaryID");

    propertyIdNode.ele("MarketingName").txt(text(property.name));

    if (property.website) {
      propertyIdNode.ele("WebSite").txt(property.website);
    }

    if (property.email) {
      propertyIdNode.ele("Email").txt(property.email);
    }

    const address = propertyIdNode.ele("Address");
    address.att("AddressType", "property");
    address.ele("AddressLine1").txt(text(property.address1));
    address.ele("City").txt(text(property.city));
    address.ele("State").txt(text(property.region));
    address.ele("PostalCode").txt(validPostal(property.postal) ? property.postal! : "");

    const propertyInfo = propertyNode.ele("Information");

    if (validDescription(property.description)) {
      propertyInfo.ele("LongDescription").txt(property.description!);
    }

    const propertyURL = buildPropertyAvailabilityURL(property);
    if (propertyURL) {
      propertyInfo.ele("PropertyAvailabilityURL").txt(propertyURL);
    }

    for (const unit of propertyUnits) {
      const unitNode = propertyNode.ele("ILS_Unit");
      const fp = floorplanById.get(unit.floorplanId);
      const images = safeImages(mergeUnitImages(unit, fp, property));

      /* Unit identity */
      const unitIdNode = unitNode.ele("UnitID");
      unitIdNode
        .ele("Identification")
        .att("IDValue", sanitizeId(unit.unitId, unit.unitNumber || "unit-id"))
        .att("IDType", "PrimaryID");

      if (unit.unitNumber) {
        unitNode.ele("UnitNumber").txt(unit.unitNumber);
      }

      if (fp?.name) {
        unitNode.ele("FloorplanName").txt(fp.name);
      }

      /* Unit info */
      const unitInfo = unitNode.ele("Information");

      const rentValue = money(unit.rentMax ?? unit.rent, "");
      if (rentValue) {
        unitInfo.ele("MarketRent").txt(rentValue);
      }

      if (fp?.beds !== undefined && fp.beds !== null) {
        unitInfo.ele("Bedrooms").txt(String(fp.beds));
      }

      if (fp?.baths !== undefined && fp.baths !== null) {
        unitInfo.ele("Bathrooms").txt(String(fp.baths));
      }

      const sqft = fp?.sqftMax ?? fp?.sqftMin;
      if (sqft !== undefined && sqft !== null) {
        unitInfo.ele("SquareFeet").txt(String(sqft));
      }

      /* Availability */
      const availability = unitNode.ele("Availability");

      const parts = toDateParts(unit.availableDate);
      if (parts) {
        availability
          .ele("VacateDate")
          .att("Day", parts.Day)
          .att("Month", parts.Month)
          .att("Year", parts.Year);
      }

      const unitURL = buildUnitAvailabilityURL(property, unit);
      if (unitURL) {
        availability.ele("UnitAvailabilityURL").txt(unitURL);
      }

      /* Images */
      if (images.length) {
        const media = unitNode.ele("Media");
        const photos = media.ele("Photos");

        for (const img of images) {
          photos.ele("Photo").txt(img);
        }
      }

      recordCount++;
    }
  }

  return {
    xml: xmlToString(root),
    recordCount,
    blockedCount: 0,
    blockedSample: [],
  };
}