import type { PanelColors } from './flight-list.types';
import type { useTheme } from 'styled-components';

/**
 * Mapea el theme de styled-components a los colores del panel FlightList.
 */
export const getPanelColors = (
  theme: ReturnType<typeof useTheme>,
): PanelColors => ({
  backgroundSecondary: theme?.tokens?.color?.background?.secondary ?? '#f2f2f2',
  borderPrimary: theme?.tokens?.color?.border?.primary ?? '#d9d9d9',
  borderInfo: theme?.tokens?.color?.border?.info ?? '#0d12ab',
  iconInfo: theme?.tokens?.color?.icon?.info ?? '#0d12ab',
  interactionSoftDefault:
    theme?.tokens?.color?.interaction?.softDefault ?? '#2c31c9',
  surfacePrimary: theme?.tokens?.color?.surface?.primary ?? '#ffffff',
  surfaceSecondary: theme?.tokens?.color?.surface?.secondary ?? '#f2f2f2',
  textPrimary: theme?.tokens?.color?.text?.primary ?? '#303030',
  textTertiary: theme?.tokens?.color?.text?.tertiary ?? '#070b64',
});
