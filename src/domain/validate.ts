import { z } from "zod";
import type { CanonicalData, Unit, Property, Floorplan } from "./canonicalTypes";

export type ValidationResult = {
  isPublishable: boolean;
  blockedReasons: string[];
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "expected ISO date");

export function validateUnit(
  unit: Unit,
  floorplan: Floorplan | undefined,
  property: Property | undefined
): ValidationResult {
  const reasons: string[] = [];

  if (!property) reasons.push("Missing property reference");
  if (!floorplan) reasons.push("Missing floorplan reference");

  if (!Number.isFinite(unit.rent) || unit.rent <= 0) reasons.push("Missing/invalid rent");

  if (floorplan) {
    if (!Number.isFinite(floorplan.beds)) reasons.push("Missing beds");
    if (!Number.isFinite(floorplan.baths)) reasons.push("Missing baths");
  }

  if (property) {
    if (!property.address1) reasons.push("Missing address1");
    if (!property.city) reasons.push("Missing city");
    if (!property.region) reasons.push("Missing region");
    if (!property.postal) reasons.push("Missing postal/zip");
    if (!property.country) reasons.push("Missing country");
  }

  const imageCount =
    (unit.images?.length || 0) +
    (floorplan?.images?.length || 0) +
    (property?.images?.length || 0);

  if (imageCount < 3) reasons.push("Not enough images (min 3 across unit/floorplan/property)");

  if (unit.availableDate) {
    const parsed = isoDate.safeParse(unit.availableDate);
    if (!parsed.success) reasons.push("Invalid availableDate format");
  }

  return { isPublishable: reasons.length === 0, blockedReasons: reasons };
}

export function indexCanonical(data: CanonicalData) {
  const propertyById = new Map(data.properties.map(p => [p.propertyId, p]));
  const floorplanById = new Map(data.floorplans.map(f => [f.floorplanId, f]));
  return { propertyById, floorplanById };
}
