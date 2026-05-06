export const TIER_DATA = [
  { name: 'None', bonus: 0, pointsRequired: 0 },
  { name: 'Rare', bonus: 10, pointsRequired: 100 },
  { name: 'Elite', bonus: 30, pointsRequired: 300 },
  { name: 'Stellar', bonus: 50, pointsRequired: 600 },
  { name: 'Master', bonus: 80, pointsRequired: 1000 },
  { name: 'Epic', bonus: 120, pointsRequired: 1500 },
  { name: 'Legendary', bonus: 160, pointsRequired: 2100 },
];

export function calculateDecay(attribute: number): number {
  if (attribute < 100) return 1.0; // Decay only applies after 100% [cite: 54]
  const exponent = Math.floor((attribute - 100) / 20); // Tiered decay [cite: 56]
  return Math.pow(0.85, exponent); // 0.85 base decay formula [cite: 26, 57]
}
