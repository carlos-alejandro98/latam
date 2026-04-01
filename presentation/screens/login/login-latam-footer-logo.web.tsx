import { Image } from 'expo-image';
import React from 'react';

import { LATAM_INVERSE_LOGO_URI } from './login-latam-footer-logo.shared';

import type { ImageStyle, StyleProp } from 'react-native';

export interface LoginLatamFooterLogoProps {
  accessibilityLabel?: string;
  style?: StyleProp<ImageStyle>;
}

/** Web: mismo flujo que antes — `expo-image` soporta el SVG remoto. */
export const LoginLatamFooterLogo: React.FC<LoginLatamFooterLogoProps> = ({
  accessibilityLabel = 'LATAM',
  style,
}) => (
  <Image
    accessibilityLabel={accessibilityLabel}
    contentFit="contain"
    source={{ uri: LATAM_INVERSE_LOGO_URI }}
    style={style}
  />
);
