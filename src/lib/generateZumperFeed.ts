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

  listingUrl: string | null;
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
  return unit.available === true;
}

function cleanHtml(value: unknown): string | null {
  const s = cleanString(value);
  if (!s) return null;
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim()))];
}

function normalizeAmenity(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function extractAmenitiesFromText(text: string | null): string[] {
  if (!text) return [];

  const patterns: Array<{ label: string; regex: RegExp }> = [
    { label: "EV Charging", regex: /\bev charging\b/i },
    { label: "Fitness Centre", regex: /\bfitness (centre|center|room|facility)\b/i },
    { label: "Bike Storage", regex: /\bbike storage\b/i },
    { label: "Playground", regex: /\bplayground\b/i },
    { label: "In-Suite Laundry", regex: /\bin[-\s]?suite laundry\b/i },
    { label: "Laundry", regex: /\blaundry\b/i },
    { label: "Storage", regex: /\bstorage\b/i },
    { label: "Pet Friendly", regex: /\bpet[-\s]?friendly\b/i },
    { label: "Hardwood Floors", regex: /\bhardwood\b/i },
    { label: "Balcony", regex: /\bbalcony\b/i },
    { label: "Parking", regex: /\bparking\b/i },
    { label: "Elevator", regex: /\belevator\b/i },
  ];

  return patterns
    .filter(({ regex }) => regex.test(text))
    .map(({ label }) => label);
}

function getSlug(unit: Unit, property?: Property, floorplan?: Floorplan): string | null {
  const candidates = [
    cleanString((unit as Record<string, unknown>)["slug"]),
    cleanString((unit as Record<string, unknown>)["urlSlug"]),
    cleanString((unit as Record<string, unknown>)["unitSlug"]),
    cleanString((property as Record<string, unknown> | undefined)?.["slug"]),
    cleanString((floorplan as Record<string, unknown> | undefined)?.["slug"]),
  ];

  return candidates.find(Boolean) || null;
}

function buildPublicUnitUrl(
  siteBaseUrl: string | null,
  unit: Unit,
  property?: Property,
  floorplan?: Floorplan
): string | null {
  if (!siteBaseUrl) return null;

  const slug = getSlug(unit, property, floorplan);
  if (slug) return `${siteBaseUrl}/units/${slug}`;

  const propertySlug =
    cleanString((property as Record<string, unknown> | undefined)?.["slug"]) ||
    cleanString(property?.name)
      ?.toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const unitNumber = cleanString(unit.unitNumber)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (propertySlug && unitNumber) {
    return `${siteBaseUrl}/units/${propertySlug}-unit-${unitNumber}`;
  }

  return null;
}

function getAmenities(property?: Property, floorplan?: Floorplan, unit?: Unit): string[] {
  const directAmenities = [
    ...cleanArray(property?.amenities),
    ...cleanArray((floorplan as Record<string, unknown> | undefined)?.["amenities"]),
    ...cleanArray((unit as Record<string, unknown> | undefined)?.["amenities"]),
  ];

  const descriptionText = uniqueStrings([
    cleanHtml(property?.description),
    cleanHtml((floorplan as Record<string, unknown> | undefined)?.["description"]),
    cleanHtml((unit as Record<string, unknown> | undefined)?.["description"]),
  ]).join(" ");

  const extracted = extractAmenitiesFromText(descriptionText);

  return [...new Set([...directAmenities.map(normalizeAmenity), ...extracted])];
}

function getContact(property?: Property): {
  phone: string | null;
  email: string | null;
  website: string | null;
} {
  const record = (property as Record<string, unknown> | undefined) ?? {};

  const phone =
    cleanString(property?.phone) ||
    cleanString(record["contactPhone"]) ||
    cleanString(record["leasingPhone"]) ||
    cleanString(record["phoneNumber"]);

  const email =
    cleanString(property?.email) ||
    cleanString(record["contactEmail"]) ||
    cleanString(record["leasingEmail"]);

  const website =
    cleanString(property?.website) ||
    cleanString(record["propertyUrl"]) ||
    cleanString(record["url"]);

  return { phone, email, website };
}

export function generateZumperFeed(
  data: CanonicalData,
  opts?: {
    availableOnly?: boolean;
    siteBaseUrl?: string;
  }
): ZumperFeed {
  const availableOnly = opts?.availableOnly === true;
  const siteBaseUrl =
    cleanString(opts?.siteBaseUrl)?.replace(/\/+$/, "") ||
    "https://wfcjan2026.webflow.io";

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
    const contact = getContact(property);
    const listingUrl = buildPublicUnitUrl(siteBaseUrl, unit, property, floorplan);

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

      description: cleanHtml(property?.description),
      amenities: getAmenities(property, floorplan, unit),
      contact,
      listingUrl,

      lastUpdated: cleanString(unit.lastUpdated),
    };
  });

  return {
    provider: "Wall Syndicator",
    generatedAt: new Date().toISOString(),
    listings,
  };
}