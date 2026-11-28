'use strict';

/**
 * Shared MEEi base appearance palettes.
 * Paid themes are intentionally not selectable here: they require a
 * server-verified cosmetic entitlement before they can be introduced.
 */
const LIGHT_C = Object.freeze({
  bg: '#FFFFFF',
  panel: '#FFFFFF',
  panel2: '#F4F9FD',
  text: '#172B3A',
  muted: '#718096',
  subtleText: '#526B7D',
  accentSoft: '#EAF5FF',
  pink: '#258FEA',
  cyan: '#43B8E8',
  border: '#E5EDF4',
  success: '#22A06B',
  danger: '#D64545',
});

const DARK_C = Object.freeze({
  bg: '#0B1420',
  panel: '#121F2D',
  panel2: '#1A2A3A',
  text: '#EAF3FA',
  muted: '#9AAFC0',
  subtleText: '#B7C7D5',
  accentSoft: '#1D3548',
  pink: '#49A9F5',
  cyan: '#65C7EF',
  border: '#2A3D50',
  success: '#4BC58C',
  danger: '#FF7373',
});

function isAppearanceMode(value) {
  return value === 'system' || value === 'light' || value === 'dark';
}

function resolveBasePalette(mode, systemColorScheme) {
  if (mode === 'dark') return DARK_C;
  if (mode === 'light') return LIGHT_C;
  return systemColorScheme === 'dark' ? DARK_C : LIGHT_C;
}

module.exports = {
  LIGHT_C,
  DARK_C,
  isAppearanceMode,
  resolveBasePalette,
};
