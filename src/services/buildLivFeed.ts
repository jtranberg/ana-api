type Property = {
  propertyId: string;
  name: string;
  address1?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
};

type Floorplan = {
  floorplanId: string;
  propertyId: string;
  name: string;
  beds?: number;
  baths?: number;
  sqftMin?: number;
  sqftMax?: number;
};

type Unit = {
  unitId: string;
  propertyId: string;
  floorplanId?: string;
  unitNumber?: string;
  rent?: number;
  available?: boolean;
  availableDate?: string;
};

type CanonicalData = {
  properties: Property[];
  floorplans: Floorplan[];
  units: Unit[];
};

type BuildLivFeedOptions = {
  available?: boolean;
};

function isAvailableNow(unit: Unit, today = new Date("2026-03-30T00:00:00Z")) {
  if (unit.available === true) return true;
  if (!unit.availableDate) return false;

  const d = new Date(unit.availableDate);
  if (Number.isNaN(d.getTime())) return false;

  return d <= today;
}

export function buildLivFeed(
  data: CanonicalData,
  options: BuildLivFeedOptions = {}
): string {
  const properties = data.properties ?? [];
  const floorplans = data.floorplans ?? [];
  const units = (data.units ?? []).filter((unit) =>
    options.available ? isAvailableNow(unit) : true
  );

  const propertyMap = new Map(properties.map((p) => [p.propertyId, p]));
  const floorplanMap = new Map(floorplans.map((f) => [f.floorplanId, f]));

  const unitXml = units
    .map((unit) => {
      const property = propertyMap.get(unit.propertyId);
      const floorplan = unit.floorplanId
        ? floorplanMap.get(unit.floorplanId)
        : undefined;

      return `
    <Unit>
      <PropertyName>${escapeXml(property?.name ?? "")}</PropertyName>
      <UnitNumber>${escapeXml(unit.unitNumber ?? "")}</UnitNumber>
      <Rent>${unit.rent ?? ""}</Rent>
      <Available>${unit.available ? "true" : "false"}</Available>
      <AvailableDate>${escapeXml(unit.availableDate ?? "")}</AvailableDate>
      <FloorplanName>${escapeXml(floorplan?.name ?? "")}</FloorplanName>
      <Beds>${floorplan?.beds ?? ""}</Beds>
      <Baths>${floorplan?.baths ?? ""}</Baths>
      <Address>${escapeXml(property?.address1 ?? "")}</Address>
      <City>${escapeXml(property?.city ?? "")}</City>
      <Region>${escapeXml(property?.region ?? "")}</Region>
      <Postal>${escapeXml(property?.postal ?? "")}</Postal>
      <Country>${escapeXml(property?.country ?? "")}</Country>
    </Unit>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<LivRentFeed>
  <Units>${unitXml}
  </Units>
</LivRentFeed>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}