import type { FontSource } from 'expo-font';

/**
 * Nombres de familia para `fontFamily` en estilos (coinciden con las claves de `useFonts`).
 * En RN, bold suele ser otra familia cargada, no solo `fontWeight: 'bold'`.
 */
export const LATAM_SANS_REGULAR = 'LatamSans-Regular';
export const LATAM_SANS_BOLD = 'LatamSans-Bold';

/** Mapa para `useFonts` / `loadAsync` — Metro empaqueta los .ttf. */
export const latamSansFontMap: Record<string, FontSource> = {
  [LATAM_SANS_REGULAR]: require('./LatamSansRegular.ttf'),
  [LATAM_SANS_BOLD]: require('./LatamSansBold.ttf'),
};
