import type { CanonicalData, Floorplan, Property, Unit } from "../domain/canonicalTypes.js";
import { createXmlRoot, xmlToString } from "./xmlWriter";

export type LivRentFeedBuild = {
  xml: string;
  recordCount: number;
  blockedCount: number;
  blockedSample: Array<{ unitId: string; reasons: string[] }>;
};

function text(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  return String(v).trim();
}

function money(v: unknown, fallback = "0.00"): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function nonEmpty<T>(arr: Array<T | undefined | null | false | "">): T[] {
  return arr.filter(Boolean) as T[];
}

function isHttpUrl(v?: string | null): boolean {
  if (!v) return false;
  return /^https?:\/\//i.test(v.trim());
}

function boolText(v: boolean | null | undefined): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "";
}

function isoNow(): string {
  return new Date().toISOString();
}

function cleanEmail(v?: string | null): string {
  if (!v) return "";
  return v.replace(/^mailto:/i, "").trim();
}

function cleanPropertyName(name?: string | null): string {
  if (!name) return "";
  return name.replace(/^wall\s+/i, "").trim();
}

function inferUnitType(_unit: Unit, floorplan?: Floorplan): string {
  const beds = floorplan?.beds ?? 0;

  if (beds === 0) return "Studio";
  if (beds === 1) return "1 Bedroom";
  if (beds === 2) return "2 Bedroom";
  if (beds === 3) return "3 Bedroom";

  return `${beds} Bedroom`;
}

function inferBuildingType(property?: Property): string {
  return (
    property?.buildingType?.trim() ||
    property?.structureType?.trim() ||
    "Apartment"
  );
}

function mergeImages(unit?: Unit, floorplan?: Floorplan, property?: Property): string[] {
  return uniq(
    nonEmpty<string>([
      ...(unit?.images || []),
      ...(floorplan?.images || []),
      ...(property?.images || []),
    ]).filter(isHttpUrl)
  ).slice(0, 30);
}

function normalizeFrequency(v?: string | null): string {
  const s = (v || "").trim().toLowerCase();
  if (!s) return "monthly";
  if (["month", "monthly", "per month"].includes(s)) return "monthly";
  if (["week", "weekly", "per week"].includes(s)) return "weekly";
  if (["year", "yearly", "annual", "annually", "per year"].includes(s)) return "yearly";
  return s;
}

function validateLivRentListing(unit: Unit, floorplan?: Floorplan, property?: Property): string[] {
  const reasons: string[] = [];
  const images = mergeImages(unit, floorplan, property);

  if (!unit.unitId?.trim()) reasons.push("Missing unitId");

  const rent = Number(unit.rent);
  if (!Number.isFinite(rent) || rent <= 0) reasons.push("Missing/invalid rent");

  if (!property?.propertyId?.trim()) reasons.push("Missing propertyId");
  if (!property?.name?.trim()) reasons.push("Missing property name");
  if (!property?.address1?.trim()) reasons.push("Missing address1");
  if (!property?.city?.trim()) reasons.push("Missing city");
  if (!property?.region?.trim()) reasons.push("Missing region");
  if (!property?.country?.trim()) reasons.push("Missing country");

  if (!images.length) reasons.push("Missing images");

  return reasons;
}

export function buildLivRentFeed(data: CanonicalData): LivRentFeedBuild {
  const propertyById = new Map(data.properties.map((p) => [p.propertyId, p]));
  const floorplanById = new Map(data.floorplans.map((f) => [f.floorplanId, f]));

  const root = createXmlRoot("LivRentFeed");
  root.ele("GeneratedAt").txt(isoNow()).up();

  const listingsNode = root.ele("Listings");

  let recordCount = 0;
  let blockedCount = 0;
  const blockedSample: Array<{ unitId: string; reasons: string[] }> = [];

  for (const unit of data.units) {
    const property = propertyById.get(unit.propertyId);
    const floorplan = floorplanById.get(unit.floorplanId);

    const reasons = validateLivRentListing(unit, floorplan, property);
    const isPublishable = reasons.length === 0;

    if (!isPublishable) {
      blockedCount++;
      if (blockedSample.length < 25) {
        blockedSample.push({ unitId: unit.unitId, reasons });
      }
      continue;
    }

    const images = mergeImages(unit, floorplan, property);
    const unitType = inferUnitType(unit, floorplan);
    const buildingType = inferBuildingType(property);
    const contactName = property?.contact?.name || property?.managementCompany || "";
    const contactPhone = property?.contact?.phone || property?.phone || "";
    const contactEmail = cleanEmail(property?.contact?.email || property?.email || "");

    const amenities = uniq(nonEmpty<string>([
      ...(property?.amenities || []),
      ...(unit.utilitiesIncluded || []),
      ...(unit.appliances || []),
      ...(property?.accessibility || []),
      ...(unit.accessibility || []),
      unit.furnished ? "Furnished" : "",
      unit.airConditioning ? "Air Conditioning" : "",
      unit.storageIncluded ? "Storage Included" : "",
    ]));

    const hasLeaseData = Boolean(unit.leaseType || unit.minLeaseMonths != null);
    const hasFeaturesData = Boolean(
      unit.petPolicy ||
      property?.petPolicy ||
      unit.utilitiesIncluded?.length ||
      unit.appliances?.length ||
      amenities.length ||
      unit.furnished != null ||
      unit.airConditioning != null ||
      unit.storageIncluded != null ||
      unit.parking ||
      property?.parkingSummary ||
      unit.accessibility?.length ||
      property?.accessibility?.length
    );

    const listing = listingsNode.ele("Listing");

    listing.ele("ListingId").txt(text(unit.unitId)).up();
    listing.ele("LastUpdated").txt(text(unit.lastUpdated || isoNow())).up();

    if (amenities.length) {
      listing.ele("AmenitiesSummary").txt(amenities.join(", ")).up();
    }

    const propertyNode = listing.ele("Property");
    propertyNode.ele("PropertyId").txt(text(property?.propertyId)).up();
    propertyNode.ele("Name").txt(text(cleanPropertyName(property?.name))).up();
    propertyNode.ele("BuildingType").txt(text(buildingType)).up();

    const addressNode = propertyNode.ele("Address");
    addressNode.ele("Address1").txt(text(property?.address1)).up();
    if (property?.address2) addressNode.ele("Address2").txt(text(property.address2)).up();
    addressNode.ele("City").txt(text(property?.city)).up();
    addressNode.ele("Region").txt(text(property?.region)).up();
    addressNode.ele("Postal").txt(text(property?.postal)).up();
    addressNode.ele("Country").txt(text(property?.country || "CA")).up();
    if (property?.lat != null) addressNode.ele("Latitude").txt(String(property.lat)).up();
    if (property?.lng != null) addressNode.ele("Longitude").txt(String(property.lng)).up();
    addressNode.up();

    if (property?.description) {
      propertyNode.ele("Description").txt(property.description).up();
    }

    if (property?.website) {
      propertyNode.ele("Website").txt(property.website).up();
    }

    if (property?.propertyPageSlug) {
      propertyNode.ele("PropertyPageSlug").txt(property.propertyPageSlug).up();
    }

    const contactNode = propertyNode.ele("Contact");
    if (contactName) contactNode.ele("Name").txt(contactName).up();
    if (contactPhone) contactNode.ele("Phone").txt(contactPhone).up();
    if (contactEmail) contactNode.ele("Email").txt(contactEmail).up();
    if (property?.managementCompany) {
      contactNode.ele("ManagementCompany").txt(property.managementCompany).up();
    }
    contactNode.up();

    const unitNode = listing.ele("Unit");
    unitNode.ele("UnitId").txt(text(unit.unitId)).up();
    unitNode.ele("UnitNumber").txt(text(unit.unitNumber || unit.unitId)).up();
    unitNode.ele("UnitType").txt(text(unitType)).up();
    unitNode.ele("BuildingType").txt(text(buildingType)).up();

    if (floorplan?.floorplanId) unitNode.ele("FloorplanId").txt(floorplan.floorplanId).up();
    if (floorplan?.name) unitNode.ele("FloorplanName").txt(floorplan.name).up();

    unitNode.ele("Bedrooms").txt(text(floorplan?.beds ?? 0)).up();
    unitNode.ele("Bathrooms").txt(text(floorplan?.baths ?? 1)).up();

    if (
      unit.sqftMin != null ||
      unit.sqftMax != null ||
      floorplan?.sqftMin != null ||
      floorplan?.sqftMax != null
    ) {
      const sqftNode = unitNode.ele("SquareFootage");
      const minSqft = unit.sqftMin ?? floorplan?.sqftMin;
      const maxSqft = unit.sqftMax ?? floorplan?.sqftMax ?? minSqft;
      if (minSqft != null) sqftNode.ele("Min").txt(text(minSqft)).up();
      if (maxSqft != null) sqftNode.ele("Max").txt(text(maxSqft)).up();
      sqftNode.up();
    }

    const pricingNode = unitNode.ele("Pricing");
    pricingNode.ele("Rent").txt(money(unit.rent)).up();
    if (unit.rentMax != null) pricingNode.ele("RentMax").txt(money(unit.rentMax)).up();
    pricingNode.ele("PriceFrequency").txt(normalizeFrequency(unit.priceFrequency)).up();
    if (unit.securityDeposit != null) {
      pricingNode.ele("SecurityDeposit").txt(money(unit.securityDeposit)).up();
    }

    if (unit.fees?.length) {
      const feesNode = pricingNode.ele("AdditionalFees");
      for (const fee of unit.fees) {
        const feeNode = feesNode.ele("Fee");
        feeNode.ele("Type").txt(text(fee.type)).up();
        if (fee.amount != null) feeNode.ele("Amount").txt(money(fee.amount)).up();
        if (fee.description) feeNode.ele("Description").txt(fee.description).up();
        feeNode.up();
      }
      feesNode.up();
    }
    pricingNode.up();

    if (hasLeaseData) {
      const leaseNode = unitNode.ele("Lease");
      if (unit.leaseType) leaseNode.ele("LeaseType").txt(unit.leaseType).up();
      if (unit.minLeaseMonths != null) {
        leaseNode.ele("MinLeaseMonths").txt(String(unit.minLeaseMonths)).up();
      }
      leaseNode.up();
    }

    const availabilityNode = unitNode.ele("Availability");
    availabilityNode.ele("IsAvailable").txt(unit.available ? "true" : "false").up();
    if (unit.availableDate) availabilityNode.ele("AvailableDate").txt(unit.availableDate).up();
    if (unit.occupancyStatus) availabilityNode.ele("OccupancyStatus").txt(unit.occupancyStatus).up();
    if (unit.leasedStatus) availabilityNode.ele("LeasedStatus").txt(unit.leasedStatus).up();
    if (unit.vacancyClass) availabilityNode.ele("VacancyClass").txt(unit.vacancyClass).up();
    availabilityNode.up();

    if (hasFeaturesData) {
      const featuresNode = unitNode.ele("Features");

      if (unit.petPolicy || property?.petPolicy) {
        featuresNode.ele("PetPolicy").txt(text(unit.petPolicy || property?.petPolicy)).up();
      }

      if (unit.utilitiesIncluded?.length) {
        const utilitiesNode = featuresNode.ele("UtilitiesIncluded");
        for (const item of unit.utilitiesIncluded) {
          utilitiesNode.ele("Utility").txt(item).up();
        }
        utilitiesNode.up();
      }

      if (unit.appliances?.length) {
        const appliancesNode = featuresNode.ele("Appliances");
        for (const item of unit.appliances) {
          appliancesNode.ele("Appliance").txt(item).up();
        }
        appliancesNode.up();
      }

      if (amenities.length) {
        const amenitiesNode = featuresNode.ele("Amenities");
        for (const item of amenities) {
          amenitiesNode.ele("Amenity").txt(item).up();
        }
        amenitiesNode.up();
      }

      if (unit.furnished != null) {
        featuresNode.ele("Furnished").txt(boolText(unit.furnished)).up();
      }
      if (unit.airConditioning != null) {
        featuresNode.ele("AirConditioning").txt(boolText(unit.airConditioning)).up();
      }
      if (unit.storageIncluded != null) {
        featuresNode.ele("StorageIncluded").txt(boolText(unit.storageIncluded)).up();
      }

      if (unit.parking) {
        const parkingNode = featuresNode.ele("Parking");
        if (unit.parking.included != null) {
          parkingNode.ele("Included").txt(boolText(unit.parking.included)).up();
        }
        if (unit.parking.spaces != null) {
          parkingNode.ele("Spaces").txt(String(unit.parking.spaces)).up();
        }
        if (unit.parking.fee != null) {
          parkingNode.ele("Fee").txt(money(unit.parking.fee)).up();
        }
        if (unit.parking.description) {
          parkingNode.ele("Description").txt(unit.parking.description).up();
        }
        parkingNode.up();
      } else if (property?.parkingSummary) {
        const parkingNode = featuresNode.ele("Parking");
        parkingNode.ele("Description").txt(property.parkingSummary).up();
        parkingNode.up();
      }

      if (unit.accessibility?.length || property?.accessibility?.length) {
        const accessibilityNode = featuresNode.ele("Accessibility");
        for (const item of uniq([...(property?.accessibility || []), ...(unit.accessibility || [])])) {
          accessibilityNode.ele("Feature").txt(item).up();
        }
        accessibilityNode.up();
      }

      featuresNode.up();
    }

    const mediaNode = unitNode.ele("Media");
    const photosNode = mediaNode.ele("Photos");
    for (const url of images) {
      photosNode.ele("Photo").txt(url).up();
    }
    photosNode.up();

    const virtualTourUrl = unit.virtualTourUrl || property?.virtualTourUrl;
    const videoUrl = unit.videoUrl || property?.videoUrl;
    if (virtualTourUrl && isHttpUrl(virtualTourUrl)) {
      mediaNode.ele("VirtualTourUrl").txt(virtualTourUrl).up();
    }
    if (videoUrl && isHttpUrl(videoUrl)) {
      mediaNode.ele("VideoUrl").txt(videoUrl).up();
    }
    mediaNode.up();

    if (unit.unitPageSlug) {
      unitNode.ele("UnitPageSlug").txt(unit.unitPageSlug).up();
    }

    unitNode.up();
    propertyNode.up();
    listing.up();

    recordCount++;
  }

  return {
    xml: xmlToString(root),
    recordCount,
    blockedCount,
    blockedSample,
  };
}