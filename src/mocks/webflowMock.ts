export const mockProperties = [
  {
    _id: "prop-1",
    name: "Maple Heights",
    slug: "maple-heights",
    city: "Vancouver",
    address: "123 Maple Street",
  }
];

export const mockFloorplans = [
  {
    _id: "fp-1",
    propertyId: "prop-1",
    name: "1 Bedroom A",
    bedrooms: 1,
    bathrooms: 1,
    sqft: 650,
  }
];

export const mockUnits = [
  {
    _id: "unit-1",
    propertyId: "prop-1",
    floorplanId: "fp-1",
    unitNumber: "304",
    price: 2395,
    available: true,
  }
];

export const mockMedia = [
  {
    _id: "media-1",
    propertyId: "prop-1",
    url: "https://example.com/images/maple-heights.jpg",
  }
];
