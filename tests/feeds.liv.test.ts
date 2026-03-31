import request from "supertest";
import { canonicalData } from "./fixtures/canonicalData";
import { getCanonicalData } from "../src/services/feedService";
import { createApp } from "../src/app";

jest.mock("../src/services/feedService", () => ({
  getCanonicalData: jest.fn(),
}));

const mockedGetCanonicalData = getCanonicalData as jest.Mock;
const app = createApp();

const FEED_USER = process.env.FEED_USER || "testuser";
const FEED_PASS = process.env.FEED_PASS || "testpass";

describe("Liv Rent feed", () => {
  beforeEach(() => {
    mockedGetCanonicalData.mockResolvedValue(canonicalData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns 200 for /feeds/liv-rent.xml", async () => {
    const res = await request(app)
      .get("/feeds/liv-rent.xml")
      .auth(FEED_USER, FEED_PASS);

    expect(res.status).toBe(200);
  });

  test("returns XML content type", async () => {
    const res = await request(app)
      .get("/feeds/liv-rent.xml")
      .auth(FEED_USER, FEED_PASS);

    expect(res.headers["content-type"]).toMatch(/xml/);
  });

  test("includes XML declaration", async () => {
    const res = await request(app)
      .get("/feeds/liv-rent.xml")
      .auth(FEED_USER, FEED_PASS);

    expect(res.text).toContain("<?xml");
  });

  test("calls canonical data service once", async () => {
    await request(app)
      .get("/feeds/liv-rent.xml")
      .auth(FEED_USER, FEED_PASS);

    expect(mockedGetCanonicalData).toHaveBeenCalledTimes(1);
  });

  test("available=true includes available unit", async () => {
    const res = await request(app)
      .get("/feeds/liv-rent.xml?available=true")
      .auth(FEED_USER, FEED_PASS);

    expect(res.status).toBe(200);
    expect(res.text).toContain("203");
  });

  test("available=true excludes unavailable future unit", async () => {
    const res = await request(app)
      .get("/feeds/liv-rent.xml?available=true")
      .auth(FEED_USER, FEED_PASS);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("204");
  });
});