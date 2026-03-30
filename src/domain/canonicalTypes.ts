export type ContactInfo = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type ParkingInfo = {
  included?: boolean | null;
  spaces?: number | null;
  fee?: number | null;
  description?: string | null;
};

export type UnitFee = {
  type: string;                 // e.g. "move-in", "pet", "parking", "storage"
  amount?: number | null;
  description?: string | null;
};

// src/domain/canonicalTypes.ts

export type Property = {
  propertyId: string;
  name: string;

  address1: string;
  address2?: string;
  city: string;
  region: string;
  postal: string;
  country: string;

  lat?: number;
  lng?: number;

  // legacy contact
  phone?: string;
  email?: string;
  website?: string;

  // structured contact
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };

  managementCompany?: string;

  description?: string;
  amenities?: string[];
  images?: string[];

  structureType?: string;
  buildingType?: string;

  // enrichment
  petPolicy?: string;
  virtualTourUrl?: string;
  videoUrl?: string;
  accessibility?: string[];

  parkingSummary?: string;

  unitCount?: number;
  propertyPageSlug?: string;
};

export type Floorplan = {
  floorplanId: string;
  propertyId: string;

  name: string;
  beds: number;
  baths: number;

  sqftMin?: number;
  sqftMax?: number;

  images?: string[];

  unitCount?: number;
  unitsAvailable?: number;

  unitType?: string;
};

export type Unit = {
  unitId: string;
  propertyId: string;
  floorplanId: string;

  unitNumber?: string;
  unitType?: string;

  // 🔥 FIXED: rent is now optional (matches normalize.ts)
  rent?: number;
  rentMax?: number;
  priceFrequency?: string;

  securityDeposit?: number;

  available: boolean;
  availableDate?: string;

  images?: string[];

  lastUpdated: string;
  unitPageSlug?: string;

  sqftMin?: number;
  sqftMax?: number;

  occupancyStatus?: string;
  leasedStatus?: string;
  vacancyClass?: string;

  leaseType?: string;
  minLeaseMonths?: number;

  furnished?: boolean;
  airConditioning?: boolean;
  storageIncluded?: boolean;

  utilitiesIncluded?: string[];
  appliances?: string[];

  petPolicy?: string;

  parking?: {
    included?: boolean;
    spaces?: number;
    fee?: number;
    description?: string;
  };

  fees?: Array<{
    type: string;
    amount?: number;
    description?: string;
  }>;

  accessibility?: string[];

  virtualTourUrl?: string;
  videoUrl?: string;
};

export type CanonicalData = {
  properties: Property[];
  floorplans: Floorplan[];
  units: Unit[];
};