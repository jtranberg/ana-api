export const canonicalData = {
  properties: [
    {
      propertyId: "p1",
      name: "Shannon Mews",
      address1: "123 Main St",
      city: "Vancouver",
      region: "BC",
      postal: "V6Z 1A1",
      country: "CA",
    },
  ],
  floorplans: [
    {
      floorplanId: "f1",
      propertyId: "p1",
      name: "Studio",
      beds: 0,
      baths: 1,
      sqftMin: 320,
      sqftMax: 320,
    },
  ],
  units: [
    {
      unitId: "u1",
      propertyId: "p1",
      floorplanId: "f1",
      unitNumber: "203",
      rent: 2000,
      available: true,
      availableDate: "2026-03-30",
      lastUpdated: "2026-03-30T00:00:00Z",
    },
    {
      unitId: "u2",
      propertyId: "p1",
      floorplanId: "f1",
      unitNumber: "204",
      rent: 2100,
      available: false,
      availableDate: "2026-04-15",
      lastUpdated: "2026-03-30T00:00:00Z",
    },
  ],
};