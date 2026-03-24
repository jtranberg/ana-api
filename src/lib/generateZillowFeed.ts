import type {
  CanonicalData,
  Property,
  Floorplan,
  Unit,
} from "../domain/canonicalTypes";

export type ZillowListing = {
  listingId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  floorplanId: string;
  floorplanName: string;
  unitNumber: string | null;

  address: {
    street: string | null;
    street2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string;
    lat: number | null;
    lng: number | null;
  };

  pricing: {
    rent: number | null;
    rentMax: number | null;
    currency: string;
  };

  details: {
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    available: boolean;
    availableOn: string | null;
    unitType: string;
  };

  media: {
    images: string[];
  };

  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };

  description: string | null;
  amenities: string[];
  listingUrl: string | null;
  lastUpdated: string | null;
};

export type ZillowFeed = {
  provider: string;
  generatedAt: string;
  listings: ZillowListing[];
};

function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function cleanArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => cleanString(v))
    .filter((v): v is string => Boolean(v));
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isAvailableNow(unit: Unit): boolean {
  if (unit.available) return true;
  if (!unit.availableDate) return false;

  const d = new Date(unit.availableDate);
  if (Number.isNaN(d.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return d <= today;
}

function guessUnitType(beds: number | null): string {
  if (beds === 0) return "studio";
  return "apartment";
}

export function generateZillowFeed(
  data: CanonicalData,
  opts?: {
    availableOnly?: boolean;
    siteBaseUrl?: string;
  }
): ZillowFeed {
  const availableOnly = opts?.availableOnly === true;
  const siteBaseUrl = cleanString(opts?.siteBaseUrl)?.replace(/\/+$/, "") || null;

  const propertyMap = new Map<string, Property>(
    data.properties.map((p) => [p.propertyId, p])
  );

  const floorplanMap = new Map<string, Floorplan>(
    data.floorplans.map((f) => [f.floorplanId, f])
  );

  const sourceUnits = availableOnly
    ? data.units.filter((unit) => isAvailableNow(unit))
    : data.units;

  const listings: ZillowListing[] = sourceUnits.map((unit) => {
    const property = propertyMap.get(unit.propertyId);
    const floorplan = floorplanMap.get(unit.floorplanId);

    const beds = toNumber(floorplan?.beds);
    const baths = toNumber(floorplan?.baths);
    const sqft =
      toNumber(floorplan?.sqftMax) ??
      toNumber(floorplan?.sqftMin);

    const mergedImages = [
      ...cleanArray(unit.images),
      ...cleanArray(floorplan?.images),
      ...cleanArray(property?.images),
    ];

    const uniqueImages = [...new Set(mergedImages)];

    const listingUrl = siteBaseUrl
      ? `${siteBaseUrl}/units/${unit.unitId}`
      : null;

    return {
      listingId: `${unit.propertyId}_${unit.unitId}`,
      propertyId: unit.propertyId,
      propertyName: cleanString(property?.name) || "Unnamed Property",
      unitId: unit.unitId,
      floorplanId: unit.floorplanId,
      floorplanName: cleanString(floorplan?.name) || "Unnamed Floorplan",
      unitNumber: cleanString(unit.unitNumber),

      address: {
        street: cleanString(property?.address1),
        street2: cleanString(property?.address2),
        city: cleanString(property?.city),
        region: cleanString(property?.region),
        postalCode: cleanString(property?.postal),
        country: cleanString(property?.country) || "CA",
        lat: toNumber(property?.lat),
        lng: toNumber(property?.lng),
      },

      pricing: {
        rent: toNumber(unit.rent),
        rentMax: toNumber(unit.rentMax),
        currency: "CAD",
      },

      details: {
        beds,
        baths,
        sqft,
        available: !!unit.available,
        availableOn: cleanString(unit.availableDate),
        unitType: guessUnitType(beds),
      },

      media: {
        images: uniqueImages,
      },

      contact: {
        phone: cleanString(property?.phone),
        email: cleanString(property?.email),
        website: cleanString(property?.website),
      },

      description: cleanString(property?.description),
      amenities: cleanArray(property?.amenities),
      listingUrl,
      lastUpdated: cleanString(unit.lastUpdated),
    };
  });

  return {
    provider: "Wall ST Syndicator",
    generatedAt: new Date().toISOString(),
    listings,
  };
}