// src/feeds/generateFeed.ts
import type { CanonicalData } from "../domain/canonicalTypes.js";
import { buildApartmentsMitsFeed } from "./buildApartmentsMitsFeed.js";

export async function generateApartmentsFull(data: CanonicalData) {
  return buildApartmentsMitsFeed(data);
}