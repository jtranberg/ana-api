export type Property = {
  propertyId: string;
  name: string;                 // Property MarketingName
  address1: string;             // Address1
  address2?: string;
  city: string;                 // City
  region: string;               // State / province
  postal: string;               // PostalCode
  country: string;
  lat?: number;                 // Latitude
  lng?: number;                 // Longitude
  phone?: string;
  email?: string;
  website?: string;
  description?: string;         // Property LongDescription
  amenities?: string[];
  images?: string[];
propertyPageSlug?: string;
  structureType?: string;       // required by PDF
  unitCount?: number;           // required by PDF
};

export type Floorplan = {
  floorplanId: string;
  propertyId: string;
  name: string;                 // Name
  beds: number;                 // Bedroom Count
  baths: number;                // Bathroom Count
  sqftMin?: number;             // Size Range min
  sqftMax?: number;             // Size Range max
  images?: string[];

  unitCount?: number;           // required by PDF
  unitsAvailable?: number;      // required by PDF
};

export type Unit = {
  unitId: string;               // UnitID
  propertyId: string;
  floorplanId: string;
  unitNumber?: string;          // can map to MarketingName
  rent: number;                 // UnitRent
  rentMax?: number;
  available: boolean;
  availableDate?: string;       // ISO date
  images?: string[];
  lastUpdated: string;          // ISO timestamp
unitPageSlug?: string;
  sqftMin?: number;             // MinSquareFeet
  sqftMax?: number;             // useful pair for size range / max sqft
  occupancyStatus?: string;     // UnitOccupancyStatus
  leasedStatus?: string;        // UnitLeasedStatus
  vacancyClass?: string;        // VacancyClass
};

export type CanonicalData = {
  properties: Property[];
  floorplans: Floorplan[];
  units: Unit[];
};