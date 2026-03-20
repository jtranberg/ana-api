import type { CanonicalData } from "../domain/canonicalTypes";
import { createXmlRoot, xmlToString } from "../feeds/xmlWriter";
import { indexCanonical, validateUnit } from "../domain/validate";

export type ApartmentsFeedBuild = {
  xml: string;
  recordCount: number;
  blockedCount: number;
  blockedSample: Array<{ unitId: string; reasons: string[] }>;
};

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

      console.log("BLOCKED UNIT", {
        unitId: unit.unitId,
        reasons: v.blockedReasons,
        propertyId: unit.propertyId,
        floorplanId: unit.floorplanId,
        propertyName: property?.name,
        address1: property?.address1,
        city: property?.city,
        region: property?.region,
        postal: property?.postal,
        country: property?.country,
        rent: unit.rent,
        beds: floorplan?.beds,
        baths: floorplan?.baths,
        imageCount:
          (unit.images?.length || 0) +
          (floorplan?.images?.length || 0) +
          (property?.images?.length || 0),
        available: unit.available,
        availableDate: unit.availableDate,
      });

      continue;
    }

    recordCount++;

    const listing = listings.ele("Listing");
    listing.ele("PropertyId").txt(property!.propertyId).up();
    listing.ele("PropertyName").txt(property!.name).up();
    listing.ele("UnitId").txt(unit.unitId).up();
    listing.ele("UnitNumber").txt(unit.unitNumber || "").up();

    listing.ele("Address1").txt(property!.address1).up();
    listing.ele("City").txt(property!.city).up();
    listing.ele("Region").txt(property!.region).up();
    listing.ele("Postal").txt(property!.postal).up();
    listing.ele("Country").txt(property!.country).up();

    listing.ele("Beds").txt(String(floorplan!.beds)).up();
    listing.ele("Baths").txt(String(floorplan!.baths)).up();
    listing.ele("Rent").txt(String(unit.rent)).up();
    listing.ele("Available").txt(unit.available ? "true" : "false").up();
    if (unit.availableDate) listing.ele("AvailableDate").txt(unit.availableDate).up();

const imgs = Array.from(
  new Set([
    ...(unit.images || []),
    ...(floorplan!.images || []),
    ...(property!.images || []),
  ])
).slice(0, 20);

const imagesNode = listing.ele("Images");
for (const url of imgs) {
  imagesNode.ele("Image").txt(url).up();
}

listing.ele("LastUpdated").txt(unit.lastUpdated).up();

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