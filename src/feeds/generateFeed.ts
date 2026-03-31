import type { CanonicalData } from "../domain/canonicalTypes";
import { buildApartmentsMitsFeed } from "./buildApartmentsMitsFeed";

export async function generateApartmentsFull(data: CanonicalData) {
  return buildApartmentsMitsFeed(data);
}