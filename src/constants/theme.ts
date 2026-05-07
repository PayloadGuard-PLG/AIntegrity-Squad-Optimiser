import { Platform } from 'react-native';

export const theme = {
  bg:        '#000000',
  surface:   '#0a0a0c',
  surface2:  '#111114',
  surface3:  '#16171c',
  hairline:  'rgba(255,255,255,0.06)',
  hairline2: 'rgba(255,255,255,0.12)',
  hairline3: 'rgba(255,255,255,0.20)',
  ink:       '#f4f4f5',
  inkSec:    '#a1a1aa',
  inkMuted:  '#6b6b73',
  inkGhost:  '#3a3a40',
  steel:     '#5b6b8a',
  steelLight:'#9eb0d4',
  steelDeep: '#3d4a66',
  hot:       '#e8b466',
  pos:       '#7eb89a',
  neg:       '#c4756a',
  mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  display: Platform.OS === 'ios' ? 'System' : 'sans-serif',
} as const;

export const TIER_COLORS: Record<string, string> = {
  None:      '#6b7280',
  Rare:      '#60a5fa',
  Elite:     '#34d399',
  Stellar:   '#22d3ee',
  Master:    '#a78bfa',
  Epic:      '#fb923c',
  Legendary: '#fbbf24',
};

export function ovrColor(ovr: number): string {
  if (ovr >= 150) return '#22c55e';
  if (ovr >= 100) return '#6366f1';
  return '#f59e0b';
}
