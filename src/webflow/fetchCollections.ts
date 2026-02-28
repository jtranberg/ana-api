// src/webflow/fetchCollections.ts
import { WebflowClient } from "./client.js";
import type { WebflowV2Item } from "./client.js";

export type WebflowCollections = {
  properties: WebflowV2Item[];
  floorplans: WebflowV2Item[]; // optional, may be []
  units: WebflowV2Item[];
  media: WebflowV2Item[]; // optional, may be []
};

/**
 * Fetch all items for the collections we care about.
 *
 * Required env vars:
 *  - WEBFLOW_COLLECTION_PROPERTIES
 *  - WEBFLOW_COLLECTION_UNITS
 *
 * Optional env vars:
 *  - WEBFLOW_COLLECTION_FLOORPLANS (if you ever add it later)
 *  - WEBFLOW_COLLECTION_MEDIA (if you ever add it later)
 */
export async function fetchAllCollections(client: WebflowClient): Promise<WebflowCollections> {
  const propsId = process.env.WEBFLOW_COLLECTION_PROPERTIES;
  const unitsId = process.env.WEBFLOW_COLLECTION_UNITS;

  // Optional collections (N/A for your current CMS)
  const fpsId = process.env.WEBFLOW_COLLECTION_FLOORPLANS;
  const mediaId = process.env.WEBFLOW_COLLECTION_MEDIA;

  if (!propsId || !unitsId) {
    throw new Error(
      "Missing one or more required collection IDs. Required: " +
        "WEBFLOW_COLLECTION_PROPERTIES, WEBFLOW_COLLECTION_UNITS"
    );
  }

  const [properties, units, floorplans, media] = await Promise.all([
    client.fetchAllItems(propsId),
    client.fetchAllItems(unitsId),
    fpsId ? client.fetchAllItems(fpsId) : Promise.resolve([]),
    mediaId ? client.fetchAllItems(mediaId) : Promise.resolve([]),
  ]);

  // v2 draft/archive flags
  const isLive = (i: WebflowV2Item) => !i.isArchived && !i.isDraft;

  return {
    properties: properties.filter(isLive),
    units: units.filter(isLive),
    floorplans: floorplans.filter(isLive),
    media: media.filter(isLive),
  };
}
