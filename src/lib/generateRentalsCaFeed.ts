import type {
  CanonicalData,
  Property,
  Floorplan,
  Unit,
} from "../domain/canonicalTypes";

export type RentalsCaListing = {
  id: string;
  propertyId: string;
  propertyName: string;
  floorplanId: string;
  floorplanName: string;
  unitId: string;
  unitNumber: string | null;

  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string;
  };

  coordinates: {
    latitude: number | null;
    longitude: number | null;
  };

  rent: {
    min: number | null;
    max: number | null;
    currency: string;
  };

  unit: {
    bedrooms: number | null;
    bathrooms: number | null;
    sqftMin: number | null;
    sqftMax: number | null;
    available: boolean;
    availableDate: string | null;
    category: string;
  };

  media: {
    images: string[];
  };

  property: {
    description: string | null;
    amenities: string[];
  };

  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };

  url: string | null;
  updatedAt: string | null;
};

export type RentalsCaFeed = {
  provider: string;
  generatedAt: string;
  listings: RentalsCaListing[];
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

function guessCategory(beds: number | null): string {
  if (beds === 0) return "studio";
  return "rental";
}

export function generateRentalsCaFeed(
  data: CanonicalData,
  opts?: {
    availableOnly?: boolean;
    siteBaseUrl?: string;
  }
): RentalsCaFeed {
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

  const listings: RentalsCaListing[] = sourceUnits.map((unit) => {
    const property = propertyMap.get(unit.propertyId);
    const floorplan = floorplanMap.get(unit.floorplanId);

    const beds = toNumber(floorplan?.beds);

    const mergedImages = [
      ...cleanArray(unit.images),
      ...cleanArray(floorplan?.images),
      ...cleanArray(property?.images),
    ];

    const uniqueImages = [...new Set(mergedImages)];

    const url = siteBaseUrl
      ? `${siteBaseUrl}/units/${unit.unitId}`
      : null;

    return {
      id: `${unit.propertyId}_${unit.unitId}`,
      propertyId: unit.propertyId,
      propertyName: cleanString(property?.name) || "Unnamed Property",
      floorplanId: unit.floorplanId,
      floorplanName: cleanString(floorplan?.name) || "Unnamed Floorplan",
      unitId: unit.unitId,
      unitNumber: cleanString(unit.unitNumber),

      address: {
        line1: cleanString(property?.address1),
        line2: cleanString(property?.address2),
        city: cleanString(property?.city),
        province: cleanString(property?.region),
        postalCode: cleanString(property?.postal),
        country: cleanString(property?.country) || "CA",
      },

      coordinates: {
        latitude: toNumber(property?.lat),
        longitude: toNumber(property?.lng),
      },

      rent: {
        min: toNumber(unit.rent),
        max: toNumber(unit.rentMax),
        currency: "CAD",
      },

      unit: {
        bedrooms: beds,
        bathrooms: toNumber(floorplan?.baths),
        sqftMin: toNumber(floorplan?.sqftMin),
        sqftMax: toNumber(floorplan?.sqftMax),
        available: !!unit.available,
        availableDate: cleanString(unit.availableDate),
        category: guessCategory(beds),
      },

      media: {
        images: uniqueImages,
      },

      property: {
        description: cleanString(property?.description),
        amenities: cleanArray(property?.amenities),
      },

      contact: {
        phone: cleanString(property?.phone),
        email: cleanString(property?.email),
        website: cleanString(property?.website),
      },

      url,
      updatedAt: cleanString(unit.lastUpdated),
    };
  });

  return {
    provider: "Wall ST Syndicator",
    generatedAt: new Date().toISOString(),
    listings,
  };
}