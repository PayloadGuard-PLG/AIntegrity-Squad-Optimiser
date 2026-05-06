import React, { createContext, useContext, useState } from 'react';
import { ManagerProfile, ManagerStyle, TalentTier, DrillLevel } from '../types/resources';

type ManagerCtx = ManagerProfile & {
  setStyle: (s: ManagerStyle) => void;
  setTierPoints: (n: number) => void;
  setGreens: (n: number) => void;
  setStoreBudget: (n: number | undefined) => void;
  togglePremiumSponsor: () => void;
  toggleTwoxAd: () => void;
  setTalentTier: (t: TalentTier) => void;
  setDrillLevel: (d: DrillLevel) => void;
};

const ManagerContext = createContext<ManagerCtx | null>(null);

export function ManagerProvider({ children }: { children: React.ReactNode }) {
  const [style, setStyle] = useState<ManagerStyle>('FTP');
  const [tierPoints, setTierPoints] = useState(0);
  const [greens, setGreens] = useState(0);
  const [isPremiumSponsor, setIsPremiumSponsor] = useState(false);
  const [storeBudget, setStoreBudget] = useState<number | undefined>(undefined);
  const [twoxAdActive, setTwoxAdActive] = useState(false);
  const [talentTier, setTalentTier] = useState<TalentTier>('Normal');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('Amateur');

  return (
    <ManagerContext.Provider value={{
      style, tierPoints, greens, isPremiumSponsor, storeBudget,
      twoxAdActive, talentTier, drillLevel,
      setStyle,
      setTierPoints,
      setGreens,
      setStoreBudget,
      togglePremiumSponsor: () => setIsPremiumSponsor(v => !v),
      toggleTwoxAd: () => setTwoxAdActive(v => !v),
      setTalentTier,
      setDrillLevel,
    }}>
      {children}
    </ManagerContext.Provider>
  );
}

export function useManager(): ManagerCtx {
  const ctx = useContext(ManagerContext);
  if (!ctx) throw new Error('useManager must be used inside <ManagerProvider>');
  return ctx;
}
