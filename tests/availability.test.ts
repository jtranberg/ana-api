import { isAvailableNow } from "../src/utils/isAvailableNow";

describe("isAvailableNow", () => {
  const fixedToday = new Date("2026-03-30T00:00:00Z");

  test("returns true when unit.available is true", () => {
    expect(isAvailableNow({ available: true }, fixedToday)).toBe(true);
  });

  test("returns true when availableDate is in the past", () => {
    expect(
      isAvailableNow(
        { available: false, availableDate: "2026-03-01" },
        fixedToday
      )
    ).toBe(true);
  });

  test("returns true when availableDate is today", () => {
    expect(
      isAvailableNow(
        { available: false, availableDate: "2026-03-30" },
        fixedToday
      )
    ).toBe(true);
  });

  test("returns false when availableDate is in the future", () => {
    expect(
      isAvailableNow(
        { available: false, availableDate: "2026-04-15" },
        fixedToday
      )
    ).toBe(false);
  });

  test("returns false for invalid date", () => {
    expect(
      isAvailableNow(
        { available: false, availableDate: "not-a-date" },
        fixedToday
      )
    ).toBe(false);
  });

  test("returns false when no availability info exists", () => {
    expect(isAvailableNow({}, fixedToday)).toBe(false);
  });
});