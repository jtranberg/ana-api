import type {
  CanonicalData,
  Property,
  Floorplan,
  Unit,
} from "../domain/canonicalTypes";

export type ZumperListing = {
  propertyId: string;
  propertyName: string;
  unitId: string;
  floorplanId: string;
  floorplanName: string;
  unitNumber: string | null;
  listingId: string;

  address: {
    street: string | null;
    street2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string;
  };

  location: {
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
    sqftMin: number | null;
    sqftMax: number | null;
    available: boolean;
    availableOn: string | null;
  };

  media: {
    images: string[];
  };

  description: string | null;
  amenities: string[];
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };

  lastUpdated: string | null;
};

export type ZumperFeed = {
  provider: string;
  generatedAt: string;
  listings: ZumperListing[];
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

export function generateZumperFeed(
  data: CanonicalData,
  opts?: { availableOnly?: boolean }
): ZumperFeed {
  const availableOnly = opts?.availableOnly === true;

  const propertyMap = new Map<string, Property>(
    data.properties.map((p) => [p.propertyId, p])
  );

  const floorplanMap = new Map<string, Floorplan>(
    data.floorplans.map((f) => [f.floorplanId, f])
  );

  const sourceUnits = availableOnly
    ? data.units.filter((unit) => isAvailableNow(unit))
    : data.units;

  const listings: ZumperListing[] = sourceUnits.map((unit) => {
    const property = propertyMap.get(unit.propertyId);
    const floorplan = floorplanMap.get(unit.floorplanId);

    const mergedImages = [
      ...cleanArray(unit.images),
      ...cleanArray(floorplan?.images),
      ...cleanArray(property?.images),
    ];

    const uniqueImages = [...new Set(mergedImages)];

    return {
      propertyId: unit.propertyId,
      propertyName: cleanString(property?.name) || "Unnamed Property",
      unitId: unit.unitId,
      floorplanId: unit.floorplanId,
      floorplanName: cleanString(floorplan?.name) || "Unnamed Floorplan",
      unitNumber: cleanString(unit.unitNumber),
      listingId: `${unit.propertyId}_${unit.unitId}`,

      address: {
        street: cleanString(property?.address1),
        street2: cleanString(property?.address2),
        city: cleanString(property?.city),
        region: cleanString(property?.region),
        postalCode: cleanString(property?.postal),
        country: cleanString(property?.country) || "CA",
      },

      location: {
        lat: toNumber(property?.lat),
        lng: toNumber(property?.lng),
      },

      pricing: {
        rent: toNumber(unit.rent),
        rentMax: toNumber(unit.rentMax),
        currency: "CAD",
      },

      details: {
        beds: toNumber(floorplan?.beds),
        baths: toNumber(floorplan?.baths),
        sqftMin: toNumber(floorplan?.sqftMin),
        sqftMax: toNumber(floorplan?.sqftMax),
        available: !!unit.available,
        availableOn: cleanString(unit.availableDate),
      },

      media: {
        images: uniqueImages,
      },

      description: cleanString(property?.description),
      amenities: cleanArray(property?.amenities),

      contact: {
        phone: cleanString(property?.phone),
        email: cleanString(property?.email),
        website: cleanString(property?.website),
      },

      lastUpdated: cleanString(unit.lastUpdated),
    };
  });

  return {
    provider: "Wall ST Syndicator",
    generatedAt: new Date().toISOString(),
    listings,
  };
}