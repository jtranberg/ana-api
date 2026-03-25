import type { CanonicalData, Floorplan, Property, Unit } from "../domain/canonicalTypes";
import { createXmlRoot, xmlToString } from "./xmlWriter";

export type ApartmentsFeedBuild = {
  xml: string;
  recordCount: number;
  blockedCount: number;
  blockedSample: Array<{ unitId: string; reasons: string[] }>;
};

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

function toDateParts(isoLike?: string): { Year: string; Month: string; Day: string } | null {
  if (!isoLike) return null;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;

  return {
    Year: String(d.getUTCFullYear()),
    Month: String(d.getUTCMonth() + 1),
    Day: String(d.getUTCDate()),
  };
}

function inferFloorplanMarketRent(units: Unit[]): { min: number; max: number } {
  const rents = units
    .map((u) => Number(u.rentMax ?? u.rent))
    .filter((n) => Number.isFinite(n) && n >= 0);

  if (!rents.length) return { min: 0, max: 0 };
  return {
    min: Math.min(...rents),
    max: Math.max(...rents),
  };
}

function buildUnitAvailabilityURL(_property: Property, unit: Unit): string {
  const siteBase = "https://wfcjan2026.webflow.io";

  if (unit.unitPageSlug?.trim()) {
    return `${siteBase}/units/${unit.unitPageSlug.trim()}`;
  }

  return "";
}

function buildPropertyAvailabilityURL(property: Property): string {
  const siteBase = "https://wfcjan2026.webflow.io";

  if (property.propertyPageSlug?.trim()) {
    return `${siteBase}/properties/${property.propertyPageSlug.trim()}`;
  }

  return "";
}

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
  if (s.includes("laundry")) return "Other";
  if (s.includes("bike")) return "Other";
  if (s.includes("pet")) return "Other";

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

export function buildApartmentsMitsFeed(data: CanonicalData): ApartmentsFeedBuild {
  const propertyById = new Map<string, Property>();
  for (const p of data.properties) propertyById.set(p.propertyId, p);

  const floorplanById = new Map<string, Floorplan>();
  for (const fp of data.floorplans) floorplanById.set(fp.floorplanId, fp);

  const floorplansByProperty = new Map<string, Floorplan[]>();
  for (const fp of data.floorplans) {
    const arr = floorplansByProperty.get(fp.propertyId) || [];
    arr.push(fp);
    floorplansByProperty.set(fp.propertyId, arr);
  }

  const unitsByProperty = new Map<string, Unit[]>();
  const unitsByFloorplan = new Map<string, Unit[]>();

  for (const u of data.units) {
    const pArr = unitsByProperty.get(u.propertyId) || [];
    pArr.push(u);
    unitsByProperty.set(u.propertyId, pArr);

    const fArr = unitsByFloorplan.get(u.floorplanId) || [];
    fArr.push(u);
    unitsByFloorplan.set(u.floorplanId, fArr);
  }

  const root = createXmlRoot("Feed");
  root.att("xmlns", "http://www.mitsproject.org/schema/2009");
  root.att("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");

  let recordCount = 0;
  const blockedCount = 0;
  const blockedSample: Array<{ unitId: string; reasons: string[] }> = [];

  for (const property of data.properties) {
    const propertyUnits = unitsByProperty.get(property.propertyId) || [];
    if (!propertyUnits.length) continue;

    const propertyFloorplans = (floorplansByProperty.get(property.propertyId) || []).filter(
      (fp) => (unitsByFloorplan.get(fp.floorplanId) || []).length > 0
    );

    const physicalProperty = root.ele("PhysicalProperty");
    const propertyNode = physicalProperty.ele("Property");
    propertyNode.att("IDValue", sanitizeId(property.propertyId, "property-id"));
    propertyNode.att("IDType", "PrimaryID");

    const propertyIdNode = propertyNode.ele("PropertyID");
    propertyIdNode
      .ele("Identification")
      .att("IDValue", sanitizeId(property.propertyId, "property-id"))
      .att("IDType", "PrimaryID")
      .up();

    propertyIdNode.ele("MarketingName").txt(text(property.name, "Unnamed Property")).up();

    if (property.website) {
      propertyIdNode.ele("WebSite").txt(text(property.website)).up();
    }

    const addressNode = propertyIdNode.ele("Address");
    addressNode.att("AddressType", "property");
    addressNode.ele("AddressLine1").txt(text(property.address1, "Address Pending")).up();
    if (property.address2) {
      addressNode.ele("AddressLine2").txt(text(property.address2)).up();
    }
    addressNode.ele("City").txt(text(property.city, "Unknown City")).up();
    addressNode.ele("State").txt(text(property.region, "BC")).up();
    addressNode.ele("PostalCode").txt(validPostal(property.postal) ? text(property.postal) : "").up();
    addressNode.up();

    if (property.email) {
      propertyIdNode.ele("Email").txt(text(property.email)).up();
    }

    const ils = propertyNode.ele("ILS_Identification");
    ils.att("ILS_IdentificationType", "Apartment");
    ils.att("RentalType", "Unspecified");
    ils.ele("Latitude").txt(text(property.lat, "0")).up();
    ils.ele("Longitude").txt(text(property.lng, "0")).up();
    ils.ele("DaylightSaving").txt("true").up();
    ils.ele("TimeZone").txt("pst").up();

    const info = propertyNode.ele("Information");
    info.ele("StructureType").txt(text(property.structureType, "Apartment")).up();
    info.ele("BuildingCount").txt("1").up();
    info.ele("UnitCount").txt(text(property.unitCount ?? propertyUnits.length, String(propertyUnits.length))).up();

    if (validDescription(property.description)) {
      info.ele("LongDescription").txt(text(property.description)).up();
    }

    const rents = propertyUnits
      .map((u) => Number(u.rent))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (rents.length) {
      const rentsNode = info.ele("Rents");
      rentsNode.ele("StartRent").txt(money(Math.min(...rents))).up();
    }

    const propertyAvailabilityURL = buildPropertyAvailabilityURL(property);
    if (propertyAvailabilityURL) {
      info.ele("PropertyAvailabilityURL").txt(propertyAvailabilityURL).up();
    }

    let amenityRank = 1;
    for (const amenity of unique(property.amenities || [])) {
      const amenityNode = propertyNode.ele("Amenity");
      amenityNode.att("AmenityType", mapAmenityType(amenity));
      amenityNode.ele("Description").txt(amenity).up();
      amenityNode.ele("Rank").txt(String(amenityRank++)).up();
    }

    for (const fp of propertyFloorplans) {
      const fpUnits = unitsByFloorplan.get(fp.floorplanId) || [];
      if (!fpUnits.length) continue;

      const rentRange = inferFloorplanMarketRent(fpUnits);

      const floorplanNode = propertyNode.ele("Floorplan");
      floorplanNode.att("IDValue", sanitizeId(fp.floorplanId, "floorplan-id"));
      floorplanNode.att("IDType", "FloorPlanID");

      floorplanNode.ele("Name").txt(text(fp.name, "Unnamed Floorplan")).up();
      floorplanNode.ele("UnitCount").txt(text(fp.unitCount ?? fpUnits.length, String(fpUnits.length))).up();

      if (propertyAvailabilityURL) {
        floorplanNode.ele("FloorplanAvailabilityURL").txt(propertyAvailabilityURL).up();
      }

      const unitsAvailable = fp.unitsAvailable ?? fpUnits.filter((u) => u.available).length;
      floorplanNode.ele("UnitsAvailable").txt(text(unitsAvailable, "0")).up();
      floorplanNode.ele("DisplayedUnitsAvailable").txt(text(unitsAvailable, "0")).up();
      floorplanNode.ele("FloorCount").txt("0").up();

      const bedRoom = floorplanNode.ele("Room");
      bedRoom.att("RoomType", "Bedroom");
      bedRoom.ele("Count").txt(decimalCount(fp.beds, "0.00")).up();
      bedRoom.ele("Comment").txt("").up();

      const bathRoom = floorplanNode.ele("Room");
      bathRoom.att("RoomType", "Bathroom");
      bathRoom.ele("Count").txt(decimalCount(fp.baths, "1.00")).up();
      bathRoom.ele("Comment").txt("").up();

      const sqftNode = floorplanNode.ele("SquareFeet");
      sqftNode.att("Min", text(fp.sqftMin ?? 0, "0"));
      sqftNode.att("Max", text(fp.sqftMax ?? fp.sqftMin ?? 0, "0"));

      const marketRent = floorplanNode.ele("MarketRent");
      marketRent.att("Min", text(rentRange.min, "0"));
      marketRent.att("Max", text(rentRange.max, "0"));

      const effectiveRent = floorplanNode.ele("EffectiveRent");
      effectiveRent.att("Min", text(rentRange.min, "0"));
      effectiveRent.att("Max", text(rentRange.max, "0"));

      if (fp.images?.length) {
        const fileNode = floorplanNode.ele("File");
        fileNode.att("FileID", `fID_${fp.floorplanId}_1`);
        fileNode.att("Active", "true");
        fileNode.ele("FileType").txt("Floorplan").up();
        fileNode.ele("Name").txt(text(fp.name, "Floorplan")).up();
        fileNode.ele("Caption").txt("").up();
        fileNode.ele("Format").txt("").up();
        fileNode.ele("Src").txt(fp.images[0]).up();
        fileNode.ele("Rank").txt("1").up();
      }
    }

    for (const unit of propertyUnits) {
      const fp = floorplanById.get(unit.floorplanId);

      const ilsUnit = propertyNode.ele("ILS_Unit");
      ilsUnit.att("IDValue", sanitizeId(unit.unitId, "unit-id"));
      ilsUnit.att("IDType", "ILS_UnitID");

      const unitImages = mergeUnitImages(unit, fp, property);
      let rank = 1;

      for (const img of unitImages) {
        const fileNode = ilsUnit.ele("File");
        fileNode.att("FileID", `unit_${unit.unitId}_${rank}`);
        fileNode.att("Active", "true");
        fileNode.ele("FileType").txt("Photo").up();
        fileNode.ele("Name").txt("Unit Photo").up();
        fileNode.ele("Caption").txt("").up();
        fileNode.ele("Format").txt("").up();
        fileNode.ele("Src").txt(img).up();
        fileNode.ele("Rank").txt(String(rank)).up();
        rank++;
      }

      const unitsNode = ilsUnit.ele("Units");
      const unitNode = unitsNode.ele("Unit");

      unitNode
        .ele("Identification")
        .att("IDValue", sanitizeId(unit.unitId, "unit-id"))
        .att("IDType", "ILS_UnitID")
        .up();

      unitNode
        .ele("Identification")
        .att("IDValue", sanitizeId(unit.floorplanId, "floorplan-id"))
        .att("IDType", "FloorPlanID")
        .up();

      unitNode.ele("MarketingName").txt(text(unit.unitNumber, unit.unitId)).up();
      unitNode.ele("Featured").txt("false").up();
      unitNode.ele("UnitType").txt(text(fp?.name, "Unit")).up();
      unitNode.ele("UnitBedrooms").txt(decimalCount(fp?.beds ?? 0)).up();
      unitNode.ele("UnitBathrooms").txt(decimalCount(fp?.baths ?? 1, "1.00")).up();
      unitNode.ele("MinSquareFeet").txt(text(unit.sqftMin ?? fp?.sqftMin ?? 0)).up();
      unitNode.ele("MaxSquareFeet").txt(text(unit.sqftMax ?? fp?.sqftMax ?? unit.sqftMin ?? 0)).up();
      unitNode.ele("UnitRent").txt(text(unit.rent, "0")).up();
      unitNode.ele("MarketRent").txt(text(unit.rentMax ?? unit.rent, "0")).up();
      unitNode.ele("UnitLeasedStatus").txt(text(unit.leasedStatus ?? "available").toLowerCase()).up();
      unitNode.ele("UnitOccupancyStatus").txt(text(unit.occupancyStatus ?? "vacant").toLowerCase()).up();
      unitNode.ele("FloorplanName").txt(text(fp?.name, "Unit")).up();
      unitNode.ele("BuildingName").txt("N/A").up();

      const effectiveRent = ilsUnit.ele("EffectiveRent");
      effectiveRent.att("Min", text(unit.rent, "0"));
      effectiveRent.att("Max", text(unit.rentMax ?? unit.rent, "0"));

      const availability = ilsUnit.ele("Availability");
      const parts = toDateParts(unit.availableDate);
      if (parts) {
        availability
          .ele("VacateDate")
          .att("Day", parts.Day)
          .att("Month", parts.Month)
          .att("Year", parts.Year)
          .up();

        availability
          .ele("MadeReadyDate")
          .att("Day", parts.Day)
          .att("Month", parts.Month)
          .att("Year", parts.Year)
          .up();
      }

      availability.ele("VacancyClass").txt(text(unit.vacancyClass ?? "Unoccupied")).up();

      const unitAvailabilityURL = buildUnitAvailabilityURL(property, unit);
      if (unitAvailabilityURL) {
        availability.ele("UnitAvailabilityURL").txt(unitAvailabilityURL).up();
      }

      recordCount++;
    }
  }

  return {
    xml: xmlToString(root),
    recordCount,
    blockedCount,
    blockedSample,
  };
}