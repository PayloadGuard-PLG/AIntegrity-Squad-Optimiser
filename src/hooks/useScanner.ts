import { useState } from 'react';
import { scanPlayerCard } from '../logic/playerScanner';

export type ScanResult = {
  stats: Record<string, number>;
  name?: string;
  age?: number;
  overall?: number;
  roles?: string[];
  tier?: string;
  talent?: string;
};

export const useScanner = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanPlayerScreenshot = async (imageUri: string): Promise<ScanResult | null> => {
    setIsScanning(true);
    setError(null);
    try {
      return await scanPlayerCard(imageUri);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  return { scanPlayerScreenshot, isScanning, scanError: error };
};
