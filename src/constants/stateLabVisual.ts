/**
 * Visual tokens for the Option Explorer / State Lab surface.
 *
 * Source: generated Option Explorer visual selected on 2026-09-22.
 * These tokens are intentionally scoped to State Lab so the existing app theme
 * can evolve independently.
 */
export const stateLabVisual = {
  page: {
    background: '#241B78',
    backgroundDeep: '#171450',
    chrome: '#171A1F',
    hero: '#4837D6',
  },
  panel: {
    surface: '#F5F8FF',
    surfaceAlt: '#EAF2FF',
    header: '#2D3EA6',
    resultHeader: '#0A8A72',
    border: '#C7D5EE',
    borderStrong: '#91A7CF',
  },
  ink: {
    primary: '#14203A',
    secondary: '#52627D',
    inverse: '#FFFFFF',
    quiet: '#7A8AA6',
  },
  semantic: {
    success: '#18A449',
    successSoft: '#DDF7E5',
    warning: '#F59E0B',
    danger: '#E53950',
    dangerSoft: '#FFE0E5',
    info: '#2D6BEA',
    purple: '#7C3AED',
    teal: '#0B8A72',
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  target: {
    referenceWidth: 941,
    referenceHeight: 1672,
    contentMaxWidth: 940,
  },
} as const;

export type StateLabVisualTokens = typeof stateLabVisual;
