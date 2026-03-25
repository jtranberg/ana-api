import type { CanonicalData } from "../domain/canonicalTypes";
import { createXmlRoot, xmlToString } from "../feeds/xmlWriter";
import { indexCanonical, validateUnit } from "../domain/validate";

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

export function buildApartmentsFullFeed(data: CanonicalData): ApartmentsFeedBuild {
  const { propertyById, floorplanById } = indexCanonical(data);

  const root = createXmlRoot("ListingsFeed");
  root.ele("GeneratedAt").txt(new Date().toISOString()).up();
  const listings = root.ele("Listings");

  let recordCount = 0;
  let blockedCount = 0;
  const blockedSample: ApartmentsFeedBuild["blockedSample"] = [];

  for (const unit of data.units) {
    const floorplan = floorplanById.get(unit.floorplanId);
    const property = propertyById.get(unit.propertyId);
    const v = validateUnit(unit, floorplan, property);

    if (!v.isPublishable) {
      blockedCount++;
      if (blockedSample.length < 25) {
        blockedSample.push({ unitId: unit.unitId, reasons: v.blockedReasons });
      }

      console.warn("NON-BLOCKING UNIT WARNING", {
        unitId: unit.unitId,
        reasons: v.blockedReasons,
        propertyId: unit.propertyId,
        floorplanId: unit.floorplanId,
      });
    }

    const safeProperty = property ?? {
      propertyId: unit.propertyId || "fallback-property",
      name: "Fallback Property",
      address1: "Address Pending",
      city: "Unknown City",
      region: "BC",
      postal: "V0V 0V0",
      country: "CA",
      lat: 49.2827,
      lng: -123.1207,
      description: "Description pending.",
      images: [],
      structureType: "Apartment",
      unitCount: 0,
    };

    const safeFloorplan = floorplan ?? {
      floorplanId: unit.floorplanId || "fallback-floorplan",
      propertyId: safeProperty.propertyId,
      name: "Unit",
      beds: 0,
      baths: 0,
      sqftMin: unit.sqftMin ?? 0,
      sqftMax: unit.sqftMax ?? unit.sqftMin ?? 0,
      images: [],
      unitCount: 1,
      unitsAvailable: unit.available ? 1 : 0,
    };

    recordCount++;

    const listing = listings.ele("Listing");

    listing.ele("PropertyId").txt(text(safeProperty.propertyId)).up();
    listing.ele("PropertyName").txt(text(safeProperty.name)).up();
    listing.ele("PropertyLatitude").txt(text(safeProperty.lat ?? 49.2827)).up();
    listing.ele("PropertyLongitude").txt(text(safeProperty.lng ?? -123.1207)).up();
    listing.ele("StructureType").txt(text(safeProperty.structureType ?? "Apartment")).up();
    listing.ele("PropertyUnitCount").txt(text(safeProperty.unitCount ?? 0)).up();
    listing.ele("PropertyDescription").txt(text(safeProperty.description ?? "Description pending.")).up();

    listing.ele("UnitId").txt(text(unit.unitId)).up();
    listing.ele("UnitNumber").txt(text(unit.unitNumber ?? `Unit-${unit.unitId}`)).up();
    listing.ele("UnitMarketingName").txt(text(unit.unitNumber ?? `Unit-${unit.unitId}`)).up();

    listing.ele("Address1").txt(text(safeProperty.address1)).up();
    if (safeProperty.address2) listing.ele("Address2").txt(text(safeProperty.address2)).up();
    listing.ele("City").txt(text(safeProperty.city)).up();
    listing.ele("Region").txt(text(safeProperty.region)).up();
    listing.ele("Postal").txt(text(safeProperty.postal)).up();
    listing.ele("Country").txt(text(safeProperty.country)).up();

    listing.ele("FloorplanId").txt(text(safeFloorplan.floorplanId)).up();
    listing.ele("FloorplanName").txt(text(safeFloorplan.name)).up();
    listing.ele("FloorplanBeds").txt(text(safeFloorplan.beds)).up();
    listing.ele("FloorplanBaths").txt(text(safeFloorplan.baths)).up();
    listing.ele("FloorplanUnitCount").txt(text(safeFloorplan.unitCount ?? 0)).up();
    listing.ele("FloorplanUnitsAvailable").txt(text(safeFloorplan.unitsAvailable ?? 0)).up();
    listing.ele("FloorplanSqftMin").txt(text(safeFloorplan.sqftMin ?? 0)).up();
    listing.ele("FloorplanSqftMax").txt(text(safeFloorplan.sqftMax ?? safeFloorplan.sqftMin ?? 0)).up();

    listing.ele("Beds").txt(text(safeFloorplan.beds)).up();
    listing.ele("Baths").txt(text(safeFloorplan.baths)).up();
    listing.ele("Rent").txt(text(unit.rent)).up();
    listing.ele("Available").txt(unit.available ? "true" : "false").up();
    if (unit.availableDate) {
      listing.ele("AvailableDate").txt(unit.availableDate).up();
    }

    listing.ele("MinSquareFeet").txt(text(unit.sqftMin ?? safeFloorplan.sqftMin ?? 0)).up();
    listing.ele("MaxSquareFeet").txt(text(unit.sqftMax ?? safeFloorplan.sqftMax ?? unit.sqftMin ?? 0)).up();
    listing.ele("UnitOccupancyStatus").txt(text(unit.occupancyStatus ?? (unit.available ? "Vacant" : "Occupied"))).up();
    listing.ele("UnitLeasedStatus").txt(text(unit.leasedStatus ?? (unit.available ? "Available" : "Leased"))).up();
    listing.ele("VacancyClass").txt(text(unit.vacancyClass ?? (unit.available ? "Unoccupied" : "Occupied"))).up();

    const imgs = Array.from(
      new Set([
        ...(unit.images || []),
        ...(safeFloorplan.images || []),
        ...(safeProperty.images || []),
      ])
    ).slice(0, 20);

    const imagesNode = listing.ele("Images");
    for (const url of imgs) {
      imagesNode.ele("Image").txt(url).up();
    }

    listing.ele("LastUpdated").txt(text(unit.lastUpdated, new Date().toISOString())).up();

    listing.up();
  }

  console.log("FEED BUILD COUNTS", {
    recordCount,
    blockedCount,
    blockedSample,
  });

  return {
    xml: xmlToString(root),
    recordCount,
    blockedCount,
    blockedSample,
  };
}