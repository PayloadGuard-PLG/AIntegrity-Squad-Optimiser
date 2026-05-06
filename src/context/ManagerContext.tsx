import React, { createContext, useContext, useState } from 'react';
import { ManagerProfile, ManagerStyle, Coach } from '../types/resources';

type ManagerCtx = ManagerProfile & {
  setStyle: (s: ManagerStyle) => void;
  setTierPoints: (n: number) => void;
  setGreens: (n: number) => void;
  setStoreBudget: (n: number | undefined) => void;
  togglePremiumSponsor: () => void;
};

const ManagerContext = createContext<ManagerCtx | null>(null);

export function ManagerProvider({ children }: { children: React.ReactNode }) {
  const [style, setStyle] = useState<ManagerStyle>('FTP');
  const [tierPoints, setTierPoints] = useState(0);
  const [greens, setGreens] = useState(0);
  const [isPremiumSponsor, setIsPremiumSponsor] = useState(false);
  const [storeBudget, setStoreBudget] = useState<number | undefined>(undefined);
  const coaches: Coach[] = []; // populated from DB via coachService per-screen

  return (
    <ManagerContext.Provider value={{
      style, coaches, tierPoints, greens, isPremiumSponsor, storeBudget,
      setStyle,
      setTierPoints,
      setGreens,
      setStoreBudget,
      togglePremiumSponsor: () => setIsPremiumSponsor(v => !v),
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
