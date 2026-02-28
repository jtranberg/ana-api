export type Property = {
  propertyId: string;
  name: string;
  address1: string;
  address2?: string;
  city: string;
  region: string; // province/state
  postal: string;
  country: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  website?: string;
  description?: string;
  amenities?: string[];
  images?: string[];
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
};

export type Unit = {
  unitId: string;
  propertyId: string;
  floorplanId: string;
  unitNumber?: string;
  rent: number;
  rentMax?: number;
  available: boolean;
  availableDate?: string; // ISO date
  images?: string[];
  lastUpdated: string; // ISO timestamp
};

export type CanonicalData = {
  properties: Property[];
  floorplans: Floorplan[];
  units: Unit[];
};
