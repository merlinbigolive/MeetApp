import { LIGHT_C } from './meeiTheme';

// Legacy Expo Router screens share the same approved light base palette.
// The main app resolves Light / Dark / System through the same module.
export const theme = {
  ...LIGHT_C,
  accent: LIGHT_C.pink,
};
