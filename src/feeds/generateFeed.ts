// src/feeds/generateFeed.ts
import type { CanonicalData } from "../domain/canonicalTypes.js";
import { buildApartmentsFullFeed } from "../adapters/apartmentsCom.js";

export async function generateApartmentsFull(data: CanonicalData) {
  return buildApartmentsFullFeed(data);
}
