import type { Request, Response } from "express";
import { generateApartmentsFull } from "../feeds/generateFeed";
import { getCanonicalFromWebflow } from "../domain/normalize";
import type { CanonicalData } from "../domain/canonicalTypes";
// NOTE:
// This endpoint uses REAL canonical Webflow data.
// Old mock scaffolding removed to avoid confusion.

export async function apartmentsFullFeed(_req: Request, res: Response) {
  const data = await getCanonicalFromWebflow();
  const result = await generateApartmentsFull(data);

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("X-Record-Count", String(result.recordCount));
  res.setHeader("X-Blocked-Count", String(result.blockedCount));

  return res.status(200).send(result.xml);
}