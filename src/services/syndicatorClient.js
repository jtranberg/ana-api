import { config } from "../config.js";

function syndicatorHeaders() {
  const token = config.syndicatorFeedToken;
  return token ? { "x-feed-token": token } : {};
}

export async function triggerApartmentsJob() {
  const url = `${config.syndicatorBaseUrl}/jobs/generate-apartments`;

  const res = await fetch(url, {
    method: "GET",
    headers: syndicatorHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Syndicator job failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json(); // returns whatever generateApartmentsFeedJob() returns
}

export function apartmentsFeedUrl() {
  // This is the protected XML endpoint (UI can’t hit it directly without token)
  return `${config.syndicatorBaseUrl}/feeds/apartments/full.xml`;
}
// backwards-compat alias (so existing routes keep working)
export const triggerSyndicatorRun = triggerApartmentsJob;
