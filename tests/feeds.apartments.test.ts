import request from "supertest";
import { createApp } from "../src/app";
import { getCanonicalFromWebflow } from "../src/domain/normalize";
import { generateApartmentsFull } from "../src/feeds/generateFeed";

jest.mock("../src/domain/normalize", () => ({
  getCanonicalFromWebflow: jest.fn(),
}));

jest.mock("../src/feeds/generateFeed", () => ({
  generateApartmentsFull: jest.fn(),
}));

const mockedGetCanonicalFromWebflow =
  getCanonicalFromWebflow as jest.MockedFunction<typeof getCanonicalFromWebflow>;

const mockedGenerateApartmentsFull =
  generateApartmentsFull as jest.MockedFunction<typeof generateApartmentsFull>;

const app = createApp();

describe("Apartments feed", () => {
  beforeEach(() => {
    mockedGetCanonicalFromWebflow.mockResolvedValue({
      properties: [],
      floorplans: [],
      units: [],
    } as any);

    mockedGenerateApartmentsFull.mockResolvedValue({
      xml: `<?xml version="1.0" encoding="UTF-8"?><Feed></Feed>`,
      recordCount: 1,
      blockedCount: 0,
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns XML", async () => {
    const res = await request(app).get("/feeds/apartments/full.xml");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/xml/);
    expect(res.text).toContain("<?xml");
  });

  test("available=true returns filtered feed", async () => {
    const res = await request(app).get("/feeds/apartments/full.xml?available=true");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/xml/);
    expect(res.text).toContain("<?xml");
  });
});