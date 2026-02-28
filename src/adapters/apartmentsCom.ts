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
      if (blockedSample.length < 25) blockedSample.push({ unitId: unit.unitId, reasons: v.blockedReasons });
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

    // Images (unit first, then floorplan, then property)
    const imgs = [
      ...(unit.images || []),
      ...(floorplan!.images || []),
      ...(property!.images || []),
    ].slice(0, 20);

    const imagesNode = listing.ele("Images");
    for (const url of imgs) imagesNode.ele("Image").txt(url).up();

    listing.ele("LastUpdated").txt(unit.lastUpdated).up();

    listing.up();
  }

  return {
    xml: xmlToString(root),
    recordCount,
    blockedCount,
    blockedSample,
  };
}
