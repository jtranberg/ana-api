type Unit = {
  available?: boolean;
  availableDate?: string;
};

export function isAvailableNow(unit?: Unit, today = new Date()): boolean {
  if (!unit) return false;

  if (unit.available === true) return true;

  if (!unit.availableDate) return false;

  const availableDate = new Date(unit.availableDate);
  if (Number.isNaN(availableDate.getTime())) return false;

  return availableDate <= today;
}