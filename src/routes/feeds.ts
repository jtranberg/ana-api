import type { Request, Response } from "express";
import { generateApartmentsFull } from "../feeds/generateFeed.js";
import { getCanonicalFromWebflow } from "../domain/normalize.js"; // ✅ real impl later
import type { CanonicalData } from "../domain/canonicalTypes.js"; // ✅ adjust path if needed

// ==============================
// 🚧 TEMP: MOCK MODE SWITCH
// Set to false (or delete) once getCanonicalFromWebflow() returns real CanonicalData
// ==============================
const USE_MOCK_WEBFLOW_DATA = true;

// ==============================
// 🚧 TEMP: MOCK CANONICAL DATA (REMOVE LATER)
// This is shaped EXACTLY like CanonicalData in ../domain/types
// Delete this block once Webflow integration is ready.
// ==============================
function getCanonicalMockData(): CanonicalData {
  const now = new Date().toISOString();

  return {
    properties: [
      {
        propertyId: "prop-1",
        name: "Maple Heights",
        address1: "123 Maple Street",
        address2: "",
        city: "Vancouver",
        region: "BC",
        postal: "V6B 1A1",
        country: "CA",
        lat: 49.2827,
        lng: -123.1207,
        phone: "+1-604-555-0100",
        email: "leasing@mapleheights.example",
        website: "https://mapleheights.example",
        description: "Modern rental community near downtown with transit access.",
        amenities: ["Gym", "Laundry", "Bike Storage"],
        images: ["https://example.com/images/maple-heights/property-1.jpg"],
      },
    ],

    floorplans: [
      {
        floorplanId: "fp-1",
        propertyId: "prop-1",
        name: "1 Bed / 1 Bath",
        beds: 1,
        baths: 1,
        sqftMin: 620,
        sqftMax: 680,
        images: ["https://example.com/images/maple-heights/floorplan-1.jpg"],
      },
    ],

    units: [
      {
        unitId: "unit-304",
        propertyId: "prop-1",
        floorplanId: "fp-1",
        unitNumber: "304",
        rent: 2395,
        rentMax: 2495,
        available: true,
        availableDate: now.slice(0, 10), // YYYY-MM-DD
        images: ["https://example.com/images/maple-heights/unit-304-1.jpg"],
        lastUpdated: now,
      },
    ],
  };
}


// ✅ This handler assumes auth is handled by requireFeedToken middleware in server.ts
// (which supports BOTH x-feed-token header and ?token= query)
export async function apartmentsFullFeed(_req: Request, res: Response) {
  const data = await getCanonicalFromWebflow(); // ✅ REAL WEBFLOW
  const result = await generateApartmentsFull(data);
  

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("X-Record-Count", String(result.recordCount));
  res.setHeader("X-Blocked-Count", String(result.blockedCount));

  return res.status(200).send(result.xml);
}

