import fs from "fs";
import path from "path";
import { buildApartmentsMitsFeed } from "../feeds/buildApartmentsMitsFeed";
import { getCanonicalFromWebflow } from "../domain/normalize";

export async function generateApartmentsFeedJob() {
  console.log("Starting Apartments.com MITS feed generation job...");

  const data = await getCanonicalFromWebflow();
  const result = buildApartmentsMitsFeed(data);

  const exportsDir = path.resolve(process.cwd(), "exports");
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir);
  }

  const filePath = path.join(exportsDir, "apartments_full.xml");
  fs.writeFileSync(filePath, result.xml);

  console.log("MITS Feed generated.");
  console.log("Records:", result.recordCount);
  console.log("Blocked:", result.blockedCount);

  return {
    filePath,
    ...result,
  };
}