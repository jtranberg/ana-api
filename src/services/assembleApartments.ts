import {
  mockProperties,
  mockFloorplans,
  mockUnits,
  mockMedia,
} from "../mocks/webflowMock.js";

export function assembleApartmentsData() {
  return mockUnits.map((unit) => {
    const property = mockProperties.find(p => p._id === unit.propertyId);
    const floorplan = mockFloorplans.find(f => f._id === unit.floorplanId);
    const media = mockMedia.filter(m => m.propertyId === unit.propertyId);

    return {
      propertyName: property?.name,
      address: property?.address,
      city: property?.city,
      unitNumber: unit.unitNumber,
      bedrooms: floorplan?.bedrooms,
      bathrooms: floorplan?.bathrooms,
      sqft: floorplan?.sqft,
      price: unit.price,
      images: media.map(m => m.url),
    };
  });
}
