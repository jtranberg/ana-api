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

function decimalCount(v: unknown, fallback = "0.00"): string {
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

function inferFloorplanMarketRent(units: Unit[]) {
  const rents = units
    .map((u) => Number(u.rentMax ?? u.rent))
    .filter((n) => Number.isFinite(n) && n >= 0);

  if (!rents.length) return { min: 0, max: 0 };

  return {
    min: Math.min(...rents),
    max: Math.max(...rents),
  };
}

/* =========================
   URL BUILDERS (FIXED)
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
   UTIL
========================= */

function mapAmenityType(label: string): string {
  const s = label.toLowerCase();

  if (s.includes("concierge")) return "Concierge";
  if (s.includes("package")) return "PackageReceiving";
  if (s.includes("elevator")) return "Elevator";
  if (s.includes("fitness")) return "FitnessCenter";
  if (s.includes("pool")) return "Pool";
  if (s.includes("spa")) return "Spa";
  if (s.includes("storage")) return "StorageSpace";
  if (s.includes("media")) return "MediaRoom";
  if (s.includes("conference")) return "ConferenceRoom";

  return "Other";
}

function validPostal(postal?: string | null): boolean {
  const p = (postal || "").trim().toUpperCase();
  return Boolean(p) && p !== "V0V 0V0";
}

function validDescription(desc?: string | null): boolean {
  const d = (desc || "").trim();
  return Boolean(d) && d !== "Description pending.";
}

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
  const propertyById = new Map(data.properties.map((p) => [p.propertyId, p]));
  const floorplanById = new Map(data.floorplans.map((f) => [f.floorplanId, f]));

  const floorplansByProperty = new Map<string, Floorplan[]>();
  for (const fp of data.floorplans) {
    const arr = floorplansByProperty.get(fp.propertyId) || [];
    arr.push(fp);
    floorplansByProperty.set(fp.propertyId, arr);
  }

  const unitsByProperty = new Map<string, Unit[]>();
  const unitsByFloorplan = new Map<string, Unit[]>();

  for (const u of data.units) {
    (unitsByProperty.get(u.propertyId) || unitsByProperty.set(u.propertyId, []).get(u.propertyId))!.push(u);
    (unitsByFloorplan.get(u.floorplanId) || unitsByFloorplan.set(u.floorplanId, []).get(u.floorplanId))!.push(u);
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

    propertyIdNode.ele("Identification")
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
    address.ele("PostalCode").txt(validPostal(property.postal) ? property.postal : "");

    const info = propertyNode.ele("Information");

    if (validDescription(property.description)) {
      info.ele("LongDescription").txt(property.description!);
    }

    const propertyURL = buildPropertyAvailabilityURL(property);
    if (propertyURL) {
      info.ele("PropertyAvailabilityURL").txt(propertyURL);
    }

    for (const unit of propertyUnits) {
      const unitNode = propertyNode.ele("ILS_Unit");

      const availability = unitNode.ele("Availability");

      const parts = toDateParts(unit.availableDate);
      if (parts) {
        availability.ele("VacateDate")
          .att("Day", parts.Day)
          .att("Month", parts.Month)
          .att("Year", parts.Year);
      }

      const unitURL = buildUnitAvailabilityURL(property, unit);
      if (unitURL) {
        availability.ele("UnitAvailabilityURL").txt(unitURL);
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