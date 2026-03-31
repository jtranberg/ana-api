export function normalizeUnit(unit: any, property: any) {
  return {
    ...unit,
    postalCode: unit.postalCode || property.postalCode,
  };
}