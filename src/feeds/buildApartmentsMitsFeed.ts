import type { CanonicalData, Floorplan, Property, Unit } from "../domain/canonicalTypes";
import { createXmlRoot, xmlToString } from "./xmlWriter";

export type ApartmentsFeedBuild = {
  xml: string;
  recordCount: number;
  blockedCount: number;
  blockedSample: Array<{ unitId: string; reasons: string[] }>;
};

type Blocked = { unitId: string; reasons: string[] };

/* =========================
   HELPERS
========================= */



function text(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  return String(v).trim();
}

function numberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(v: unknown, fallback = "0.00"): string {
  const n = numberOrNull(v);
  return n === null ? fallback : n.toFixed(2);
}

function integerString(v: unknown, fallback = ""): string {
  const n = numberOrNull(v);
  return n === null ? fallback : String(Math.round(n));
}

function decimalCountString(v: unknown, fallback = ""): string {
  const n = numberOrNull(v);
  return n === null ? fallback : n.toFixed(2);
}

function sanitizeId(v: string | undefined, fallback: string): string {
  const s = (v || "").trim();
  return s || fallback;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function looksLikeUrl(url: string): boolean {
  const s = (url || "").trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://");
}

function safeUrls(urls: string[]): string[] {
  return urls.filter(looksLikeUrl);
}

function safeImages(images: string[]): string[] {
  return safeUrls(images).slice(0, 20);
}

function validPostal(postal?: string | null): boolean {
  const p = (postal || "").trim().toUpperCase();
  return Boolean(p) && p !== "V0V 0V0";
}

function validDescription(desc?: string | null): boolean {
  const d = (desc || "").trim();
  return Boolean(d) && d !== "Description pending.";
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

function structureTypeForApartmentsCom(value?: string | null): string {
  const s = (value || "").trim().toLowerCase();

  if (!s) return "Garden Style";
  if (s.includes("high")) return "High Rise";
  if (s.includes("mid")) return "Mid Rise";
  if (s.includes("garden")) return "Garden Style";
  if (s.includes("town")) return "Garden Style";
  if (s.includes("walk")) return "Garden Style";
  if (s.includes("low")) return "Garden Style";

  return "Garden Style";
}

function occupancyStatusForMits(unit: Unit): "vacant" | "occupied" {
  const raw = (unit.occupancyStatus || "").trim().toLowerCase();
  if (raw === "vacant" || raw === "occupied") return raw;
  return unit.available ? "vacant" : "occupied";
}

function leasedStatusForMits(unit: Unit): "available" | "on notice" | "leased" {
  const raw = (unit.leasedStatus || "").trim().toLowerCase();
  if (raw === "available" || raw === "on notice" || raw === "leased") return raw;

  if (unit.available) return "available";
  return "leased";
}

function vacancyClassForMits(unit: Unit): "Unoccupied" | "Occupied" {
  const raw = (unit.vacancyClass || "").trim().toLowerCase();
  if (raw === "unoccupied") return "Unoccupied";
  if (raw === "occupied") return "Occupied";

  return unit.available ? "Unoccupied" : "Occupied";
}

function unitMarketingName(unit: Unit): string {
  return text(unit.unitNumber, sanitizeId(unit.unitId, "unit"));
}

function mergeUnitImages(unit: Unit, fp?: Floorplan, property?: Property): string[] {
  return unique([
    ...(unit.images || []),
    ...(fp?.images || []),
    ...(property?.images || []),
  ]).slice(0, 20);
}

function buildComment(unit: Unit, property?: Property): string {
  const bits = unique(
    [
      unit.petPolicy,
      unit.furnished ? "Furnished available." : "",
      ...(unit.appliances || []),
      ...(unit.utilitiesIncluded || []),
      ...(unit.accessibility || []),
      ...(property?.accessibility || []),
    ]
      .map((x) => text(x))
      .filter(Boolean)
  );

  return bits.join(" | ");
}

function cleanBuildingName(name?: string | null): string {
  const raw = text(name, "N/A");
  return raw.replace(/^wall\s+/i, "").trim() || raw;
}

function cleanMarketingName(name?: string | null): string {
  const raw = text(name, "");
  return raw.replace(/^wall\s+/i, "").trim() || raw;
}

function shortDescription(desc?: string | null): string {
  const cleaned = text(desc).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length <= 160 ? cleaned : `${cleaned.slice(0, 157).trim()}...`;
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

function buildFloorplanAvailabilityURL(property: Property, floorplan: Floorplan): string {
  const propertyUrl = buildPropertyAvailabilityURL(property);
  if (propertyUrl) return propertyUrl;
  return `${SITE_BASE}/floorplans/${floorplan.floorplanId}`;
}

/* =========================
   AMENITIES
========================= */

const PROPERTY_AMENITY_MAP: Record<string, string> = {
  elevator: "Elevator",
  pool: "Pool",
  spa: "Spa",
  concierge: "Concierge",
  package: "PackageReceiving",
  fitness: "FitnessCenter",
  gym: "FitnessCenter",
  conference: "ConferenceRoom",
  media: "MediaRoom",
  storage: "StorageSpace",
  furnished: "FurnishedAvailable",
};

function mapAmenityType(label: string): string {
  const s = label.trim().toLowerCase();
  for (const [key, mitsType] of Object.entries(PROPERTY_AMENITY_MAP)) {
    if (s.includes(key)) return mitsType;
  }
  return "Other";
}

/* =========================
   VALIDATION
========================= */

function validateProperty(property: Property): string[] {
  const reasons: string[] = [];

  if (!text(property.propertyId)) reasons.push("Missing propertyId");
  if (!text(property.name)) reasons.push("Missing property name");
  if (!text(property.address1)) reasons.push("Missing property address1");
  if (!text(property.city)) reasons.push("Missing property city");
  if (!text(property.region)) reasons.push("Missing property region/state");
  if (!validPostal(property.postal)) reasons.push("Missing valid property postal code");
  if (numberOrNull(property.lat) === null) reasons.push("Missing property latitude");
  if (numberOrNull(property.lng) === null) reasons.push("Missing property longitude");
  if (!validDescription(property.description)) reasons.push("Missing property description");

  return reasons;
}

function validateFloorplan(fp: Floorplan | undefined): string[] {
  const reasons: string[] = [];
  if (!fp) {
    reasons.push("Missing floorplan");
    return reasons;
  }

  if (!text(fp.floorplanId)) reasons.push("Missing floorplanId");
  if (!text(fp.name)) reasons.push("Missing floorplan name");
  if (numberOrNull(fp.beds) === null) reasons.push("Missing floorplan beds");
  if (numberOrNull(fp.baths) === null) reasons.push("Missing floorplan baths");
  if (numberOrNull(fp.sqftMin ?? fp.sqftMax) === null) reasons.push("Missing floorplan square feet");

  return reasons;
}

function validateUnit(unit: Unit, property: Property, fp?: Floorplan): string[] {
  const reasons: string[] = [];
  reasons.push(...validateProperty(property));
  reasons.push(...validateFloorplan(fp));

  if (!text(unit.unitId)) reasons.push("Missing unitId");
  if (!text(unit.unitNumber)) reasons.push("Missing unitNumber / MarketingName");

  const sqft = numberOrNull(unit.sqftMin ?? unit.sqftMax ?? fp?.sqftMin ?? fp?.sqftMax);
  if (sqft === null) reasons.push("Missing unit square feet");

  const rent = numberOrNull(unit.rent ?? unit.rentMax);
  if (rent === null) reasons.push("Missing unit rent");

  return unique(reasons);
}

/* =========================
   MAIN BUILDER
========================= */

export function buildApartmentsMitsFeed(
  data: CanonicalData,
  options?: { availableOnly?: boolean }
): ApartmentsFeedBuild {
  const floorplanById = new Map(data.floorplans.map((f) => [f.floorplanId, f]));

  const floorplansByProperty = new Map<string, Floorplan[]>();
  for (const fp of data.floorplans) {
    const arr = floorplansByProperty.get(fp.propertyId) || [];
    arr.push(fp);
    floorplansByProperty.set(fp.propertyId, arr);
  }

  const unitsByProperty = new Map<string, Unit[]>();
  for (const u of data.units) {
    const arr = unitsByProperty.get(u.propertyId) || [];
    arr.push(u);
    unitsByProperty.set(u.propertyId, arr);
  }

  const unitsByFloorplan = new Map<string, Unit[]>();
  for (const u of data.units) {
    const arr = unitsByFloorplan.get(u.floorplanId) || [];
    arr.push(u);
    unitsByFloorplan.set(u.floorplanId, arr);
  }

  const root = createXmlRoot("Feed");
  root.att("xmlns", "http://www.mitsproject.org/schema/2009");
  root.att("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");

  const isAvailableFeed = options?.availableOnly === true;

  let recordCount = 0;
  const blockedSample: Blocked[] = [];
  let blockedCount = 0;

  for (const property of data.properties) {
    const propertyUnits = unitsByProperty.get(property.propertyId) || [];
    const propertyFloorplans = floorplansByProperty.get(property.propertyId) || [];

    if (!propertyUnits.length && !propertyFloorplans.length) continue;

    const propertyValidation = validateProperty(property);
    if (propertyValidation.length) {
      blockedCount++;
      blockedSample.push({
        unitId: `${property.propertyId}::property`,
        reasons: propertyValidation,
      });
      continue;
    }

    const physicalProperty = root.ele("PhysicalProperty");
    const propertyNode = physicalProperty.ele("Property");

    propertyNode.att("IDValue", sanitizeId(property.propertyId, "property-id"));
    propertyNode.att("IDType", "PrimaryID");

    /* =========================
       PROPERTY ID
    ========================= */
    const propertyIdNode = propertyNode.ele("PropertyID");

    propertyIdNode
      .ele("Identification")
      .att("IDValue", sanitizeId(property.propertyId, "property-id"))
      .att("IDType", "PrimaryID");

    propertyIdNode.ele("MarketingName").txt(cleanMarketingName(property.name));

    const website = text(property.website);
    if (website) propertyIdNode.ele("WebSite").txt(website);

    const propertyEmail = text(property.contact?.email || property.email);
    if (propertyEmail) propertyIdNode.ele("Email").txt(propertyEmail);

    const address = propertyIdNode.ele("Address");
    address.att("AddressType", "property");
    address.ele("AddressLine1").txt(text(property.address1));
    if (text(property.address2)) {
      address.ele("AddressLine2").txt(text(property.address2));
    }
    address.ele("City").txt(text(property.city));
    address.ele("State").txt(text(property.region));
    address.ele("PostalCode").txt(text(property.postal));
    address.ele("Country").txt("CA");

    /* =========================
       ILS IDENTIFICATION
    ========================= */
    const ils = propertyNode.ele("ILS_Identification");
    ils.att("ILS_IdentificationType", "Apartment");
    ils.att("RentalType", "Unspecified");
    ils.ele("Latitude").txt(String(numberOrNull(property.lat)!));
    ils.ele("Longitude").txt(String(numberOrNull(property.lng)!));
    ils.ele("DaylightSaving").txt("true");
    ils.ele("TimeZone").txt("Pacific");

    /* =========================
       PROPERTY INFORMATION
    ========================= */
    const propertyInfo = propertyNode.ele("Information");
    propertyInfo.ele("StructureType").txt(
      structureTypeForApartmentsCom(property.structureType || property.buildingType)
    );
    propertyInfo.ele("BuildingCount").txt("1");

    const totalPropertyUnits = propertyFloorplans.reduce(
      (sum, fp) => sum + (numberOrNull(fp.unitCount) ?? 0),
      0
    );

    const propertyUnitCount = isAvailableFeed
      ? propertyUnits.length
      : totalPropertyUnits > 0
        ? totalPropertyUnits
        : propertyUnits.length;

    propertyInfo.ele("UnitCount").txt(String(propertyUnitCount));

    if (validDescription(property.description)) {
      propertyInfo.ele("LongDescription").txt(property.description!);
      propertyInfo.ele("ShortDescription").txt(shortDescription(property.description));
    }

    const propertyURL = buildPropertyAvailabilityURL(property);
    if (propertyURL) {
      propertyInfo.ele("PropertyAvailabilityURL").txt(propertyURL);
    }

    if (property.parkingSummary) {
      const parking = propertyInfo.ele("Parking");
      parking.att("ParkingType", "Other");
      parking.ele("Comment").txt(property.parkingSummary);
    }

    /* =========================
       PROPERTY FEES
    ========================= */
    const propertyFeeCandidates = unique(
      propertyUnits.flatMap((u) => u.fees || []).filter((f) => text(f.type))
    );

    if (propertyFeeCandidates.length) {
      const feesNode = propertyNode.ele("Fees");
      for (const fee of propertyFeeCandidates) {
        const feeNode = feesNode.ele("Fee");
        feeNode.ele("FeeType").txt(text(fee.type, "Other Fee"));
        if (numberOrNull(fee.amount) !== null) {
          feeNode.ele("Amount").txt(integerString(fee.amount));
        }
        feeNode.ele("Refundable").txt("false");
        feeNode.ele("Required").txt("false");
        feeNode.ele("Recurring").txt("false");
        if (text(fee.description)) {
          feeNode.ele("Comments").txt(text(fee.description));
        }
      }
    }

    /* =========================
       PROPERTY AMENITIES
    ========================= */
    const propertyAmenities = unique([
      ...(property.amenities || []),
      ...(property.accessibility || []),
    ]).filter(Boolean);

    let amenityRank = 1;
    for (const amenity of propertyAmenities) {
      const amenityNode = propertyNode.ele("Amenity");
      amenityNode.att("AmenityType", mapAmenityType(amenity));
      amenityNode.ele("Description").txt(amenity);
      amenityNode.ele("Rank").txt(String(amenityRank++));
    }

    /* =========================
       PROPERTY PET POLICY
    ========================= */
    if (text(property.petPolicy)) {
      const policyNode = propertyNode.ele("Policy");
      const petNode = policyNode.ele("Pet");
      petNode.att("Allowed", "true");
      petNode.ele("Restrictions").txt(text(property.petPolicy));
    }

    /* =========================
       FLOORPLANS
    ========================= */
    for (const fp of propertyFloorplans) {
      const fpUnits = unitsByFloorplan.get(fp.floorplanId) || [];

      const computedAvailableUnits = fpUnits.filter((u) => u.available).length;

      const unitsAvailable = isAvailableFeed
        ? computedAvailableUnits
        : (numberOrNull(fp.unitsAvailable) ?? computedAvailableUnits);

      const unitCount = numberOrNull(fp.unitCount) ?? fpUnits.length;

      const floorplanNode = propertyNode.ele("Floorplan");
      floorplanNode.att("IDValue", sanitizeId(fp.floorplanId, "floorplan-id"));
      floorplanNode.att("IDType", "FloorPlanID");

      floorplanNode.ele("Name").txt(text(fp.name));
      floorplanNode.ele("UnitCount").txt(String(unitCount));
      floorplanNode.ele("UnitsAvailable").txt(String(unitsAvailable));
      floorplanNode.ele("DisplayedUnitsAvailable").txt(String(unitsAvailable));
      floorplanNode.ele("FloorplanAvailabilityURL").txt(
        buildFloorplanAvailabilityURL(property, fp)
      );
      floorplanNode.ele("FloorCount").txt("0");

      const bedRoom = floorplanNode.ele("Room");
      bedRoom.att("RoomType", "Bedroom");
      bedRoom.ele("Count").txt(decimalCountString(fp.beds, "0.00"));
      bedRoom.ele("Comment").txt("");

      const bathRoom = floorplanNode.ele("Room");
      bathRoom.att("RoomType", "Bathroom");
      bathRoom.ele("Count").txt(decimalCountString(fp.baths, "0.00"));
      bathRoom.ele("Comment").txt("");

      const sqftMin =
        numberOrNull(fp.sqftMin) ?? numberOrNull(fp.sqftMax) ?? 0;
      const sqftMax =
        numberOrNull(fp.sqftMax) ?? numberOrNull(fp.sqftMin) ?? sqftMin;

      floorplanNode
        .ele("SquareFeet")
        .att("Min", String(Math.round(sqftMin)))
        .att("Max", String(Math.round(sqftMax)));

      const rents = fpUnits
        .map((u) => numberOrNull(u.rent ?? u.rentMax))
        .filter((n): n is number => n !== null);

      const minRent = rents.length ? Math.round(Math.min(...rents)) : 0;
      const maxRent = rents.length ? Math.round(Math.max(...rents)) : 0;

      floorplanNode
        .ele("MarketRent")
        .att("Min", String(minRent))
        .att("Max", String(maxRent));

      floorplanNode
        .ele("EffectiveRent")
        .att("Min", String(minRent))
        .att("Max", String(maxRent));

      const deposit = fpUnits
        .map((u) => numberOrNull(u.securityDeposit))
        .filter((n): n is number => n !== null)[0];

      if (deposit !== undefined) {
        const depositNode = floorplanNode.ele("Deposit");
        depositNode.att("DepositType", "Deposit");
        depositNode
          .ele("Amount")
          .att("AmountType", "Actual")
          .ele("ValueRange")
          .att("Exact", money(deposit));
      }

      const floorplanImage = safeImages(fp.images || [])[0];
      if (floorplanImage) {
        const fileNode = floorplanNode.ele("File");
        fileNode.att("FileID", `fp_${sanitizeId(fp.floorplanId, "floorplan")}_1`);
        fileNode.att("Active", "true");
        fileNode.ele("FileType").txt("Floorplan");
        fileNode.ele("Name").txt(text(fp.name));
        fileNode.ele("Caption").txt("");
        fileNode.ele("Format").txt("");
        fileNode.ele("Src").txt(floorplanImage);
        fileNode.ele("Rank").txt("1");
      }
    }

    /* =========================
       UNITS
    ========================= */
    for (const unit of propertyUnits) {
      const fp = floorplanById.get(unit.floorplanId);
      const reasons = validateUnit(unit, property, fp);

      if (reasons.length) {
        blockedCount++;
        if (blockedSample.length < 25) {
          blockedSample.push({ unitId: unit.unitId, reasons });
        }
        continue;
      }

      const unitImages = safeImages(mergeUnitImages(unit, fp, property));
      const unitSqft =
        numberOrNull(unit.sqftMin ?? unit.sqftMax ?? fp?.sqftMin ?? fp?.sqftMax) ?? 0;
      const unitRent = numberOrNull(unit.rent ?? unit.rentMax) ?? 0;
      const dateParts = toDateParts(unit.availableDate);
      const comment = buildComment(unit, property);

      const ilsUnit = propertyNode.ele("ILS_Unit");
      ilsUnit.att("IDValue", sanitizeId(unit.unitId, unit.unitNumber || "unit-id"));
      ilsUnit.att("IDType", "ILS_UnitID");

      unitImages.forEach((img, idx) => {
        const fileNode = ilsUnit.ele("File");
        fileNode.att("FileID", `unit_${sanitizeId(unit.unitId, "unit")}_${idx + 1}`);
        fileNode.att("Active", "true");
        fileNode.ele("FileType").txt(idx === 0 && !!fp?.images?.length ? "Floorplan" : "Photo");
        fileNode.ele("Name").txt(idx === 0 ? "Unit Diagram" : "Unit Photo");
        fileNode.ele("Caption").txt("");
        fileNode.ele("Format").txt("");
        fileNode.ele("Src").txt(img);
        fileNode.ele("Rank").txt(String(idx + 1));
      });

      if (looksLikeUrl(text(unit.virtualTourUrl || unit.videoUrl))) {
        const mediaNode = ilsUnit.ele("File");
        mediaNode.att("FileID", `unit_${sanitizeId(unit.unitId, "unit")}_tour`);
        mediaNode.att("Active", "true");
        mediaNode.ele("FileType").txt("Other");
        mediaNode.ele("Name").txt("Virtual Tour");
        mediaNode.ele("Caption").txt("");
        mediaNode.ele("Format").txt("");
        mediaNode.ele("Src").txt(text(unit.virtualTourUrl || unit.videoUrl));
        mediaNode.ele("Rank").txt(String(unitImages.length + 1));
      }

      const unitsNode = ilsUnit.ele("Units");
      const unitNode = unitsNode.ele("Unit");

      unitNode
        .ele("Identification")
        .att("IDValue", sanitizeId(unit.unitId, unit.unitNumber || "unit-id"))
        .att("IDType", "ILS_UnitID");

      if (fp) {
        unitNode
          .ele("Identification")
          .att("IDValue", sanitizeId(fp.floorplanId, "floorplan-id"))
          .att("IDType", "FloorPlanID");
      }

      unitNode.ele("MarketingName").txt(unitMarketingName(unit));
      unitNode.ele("Featured").txt("false");
      if (fp?.name) unitNode.ele("UnitType").txt(fp.name);

      unitNode.ele("UnitBedrooms").txt(decimalCountString(fp?.beds, "0.00"));
      unitNode.ele("UnitBathrooms").txt(decimalCountString(fp?.baths, "0.00"));
      unitNode.ele("MinSquareFeet").txt(String(Math.round(unitSqft)));
      unitNode.ele("MaxSquareFeet").txt(String(Math.round(unitSqft)));
      unitNode.ele("UnitRent").txt(String(Math.round(unitRent)));
      unitNode.ele("MarketRent").txt(String(Math.round(unitRent)));
      unitNode.ele("UnitLeasedStatus").txt(leasedStatusForMits(unit));
      unitNode.ele("UnitOccupancyStatus").txt(occupancyStatusForMits(unit));
      if (fp?.name) unitNode.ele("FloorplanName").txt(fp.name);
      unitNode.ele("BuildingName").txt(cleanBuildingName(property.name));

      const unitAmenities = unique([
        ...(unit.appliances || []),
        ...(unit.utilitiesIncluded || []),
        ...(unit.accessibility || []),
      ]).filter(Boolean);

      let unitAmenityRank = 1;
      for (const amenity of unitAmenities) {
        const amenityNode = unitNode.ele("Amenity");
        amenityNode.att("AmenityType", "Other");
        amenityNode.ele("Description").txt(amenity);
        amenityNode.ele("Rank").txt(String(unitAmenityRank++));
      }

      if (comment) {
        ilsUnit.ele("Comment").txt(comment);
      }

      ilsUnit
        .ele("EffectiveRent")
        .att("Min", String(Math.round(unitRent)))
        .att("Max", String(Math.round(unitRent)));

      if (numberOrNull(unit.securityDeposit) !== null) {
        const depositNode = ilsUnit.ele("Deposit");
        depositNode.att("DepositType", "Deposit");
        depositNode
          .ele("Amount")
          .att("AmountType", "Actual")
          .ele("ValueRange")
          .att("Exact", money(unit.securityDeposit));
      }

      const availability = ilsUnit.ele("Availability");
      if (dateParts) {
        availability
          .ele("VacateDate")
          .att("Day", dateParts.Day)
          .att("Month", dateParts.Month)
          .att("Year", dateParts.Year);

        availability
          .ele("MadeReadyDate")
          .att("Day", dateParts.Day)
          .att("Month", dateParts.Month)
          .att("Year", dateParts.Year);
      }

      availability.ele("VacancyClass").txt(vacancyClassForMits(unit));

      const unitUrl = buildUnitAvailabilityURL(property, unit);
      if (unitUrl) {
        availability.ele("UnitAvailabilityURL").txt(unitUrl);
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