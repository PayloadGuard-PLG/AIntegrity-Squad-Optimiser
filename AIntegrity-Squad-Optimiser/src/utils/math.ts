import { TierName } from '../types/resources';

export const TIER_DATA: { name: TierName; attrAddition: number; pointsRequired: number }[] = [
  { name: 'None',      attrAddition: 0,   pointsRequired: 0 },
  { name: 'Rare',      attrAddition: 10,  pointsRequired: 100 },
  { name: 'Elite',     attrAddition: 30,  pointsRequired: 90 },
  { name: 'Stellar',   attrAddition: 50,  pointsRequired: 50 },
  { name: 'Master',    attrAddition: 80,  pointsRequired: 25 },
  { name: 'Epic',      attrAddition: 120, pointsRequired: 15 },
  { name: 'Legendary', attrAddition: 160, pointsRequired: 10 },
];

export function getTierData(tierName: TierName): { attrAddition: number; pointsRequired: number } {
  return TIER_DATA.find(t => t.name === tierName) ?? { attrAddition: 0, pointsRequired: 0 };
}

/** Per-white-attribute addition when upgrading to this tier. */
export function getTierAttrAddition(tierName: TierName): number {
  return getTierData(tierName).attrAddition;
}

export function getTierCost(tierName: TierName): number {
  return getTierData(tierName).pointsRequired;
}
