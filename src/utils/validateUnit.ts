type ValidationResult = {
  isPublishable: boolean;
  blockedReasons: string[];
};

export function validateUnit(
  unit: any,
  floorplan?: any,
  property?: any
): ValidationResult {
  const reasons: string[] = [];

  if (!property) {
    reasons.push("missing property");
  }

  if (!unit?.rent) {
    reasons.push("missing rent");
  }

  return {
    isPublishable: reasons.length === 0,
    blockedReasons: reasons,
  };
}