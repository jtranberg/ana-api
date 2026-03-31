import { normalizeUnit } from "../src/utils/normalizeUnit";

describe("normalizeUnit fallback behavior", () => {
  test("uses property postal code fallback when unit postal code missing", () => {
    const unit = {
      id: "u1",
      postalCode: ""
    };

    const property = {
      postalCode: "V8V 1A1"
    };

    const normalized = normalizeUnit(unit, property);

    expect(normalized.postalCode).toBe("V8V 1A1");
  });

  test("preserves unit postal code when present", () => {
    const unit = {
      id: "u1",
      postalCode: "V6B 2W5"
    };

    const property = {
      postalCode: "V8V 1A1"
    };

    const normalized = normalizeUnit(unit, property);

    expect(normalized.postalCode).toBe("V6B 2W5");
  });
});