import { validateUnit } from "../src/utils/validateUnit";

describe("validateUnit", () => {
  test("publishable when property and rent exist", () => {
    const unit = {
      unitId: "u1",
      propertyId: "p1",
      rent: 2000
    };

    const floorplan = { floorplanId: "f1" };
    const property = { propertyId: "p1", name: "Shannon Mews" };

    const result = validateUnit(unit, floorplan, property);

    expect(result.isPublishable).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  test("blocked when property missing", () => {
    const unit = {
      unitId: "u1",
      propertyId: "missing",
      rent: 2000
    };

    const result = validateUnit(unit, undefined, undefined);

    expect(result.isPublishable).toBe(false);
    expect(result.blockedReasons.length).toBeGreaterThan(0);
  });

  test("blocked when rent missing", () => {
    const unit = {
      unitId: "u1",
      propertyId: "p1"
    };

    const property = { propertyId: "p1", name: "Test Property" };

    const result = validateUnit(unit, undefined, property);

    expect(result.isPublishable).toBe(false);
    expect(result.blockedReasons).toContain("missing rent");
  });
});