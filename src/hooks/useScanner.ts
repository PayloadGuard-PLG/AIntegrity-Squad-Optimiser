import { useState } from 'react';
import { scanPlayerCard } from '../logic/playerScanner';
import type { RgbaImage, PlaystyleFamily, StatBoost, ReviewFlag } from '../logic/glyphReader';

export type { ReviewFlag, PlaystyleFamily, StatBoost };

export type ScanResult = {
  stats: Record<string, number>;
  name?: string;
  age?: number;
  overall?: number;
  roles?: string[];
  tier?: string;
  talent?: string;
  newRole?: string;
  newRolePoints?: number;
  // --- glyph-reader fields (spec §4). Absent => not read; see `review`.
  establishedRoles?: string[];
  learningRole?: { role: string; points: number } | null;
  playstyle?: PlaystyleFamily;
  specialAbilities?: string[];
  boosts?: Record<string, StatBoost>;
  /** Abstention channel. Never undefined; empty means a clean read. */
  review: ReviewFlag[];
};

export const useScanner = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanPlayerScreenshot = async (
    imageUri: string,
    image?: RgbaImage | null
  ): Promise<ScanResult | null> => {
    setIsScanning(true);
    setError(null);
    try {
      return await scanPlayerCard(imageUri, image);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  return { scanPlayerScreenshot, isScanning, scanError: error };
};
