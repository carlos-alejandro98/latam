import { Image } from 'expo-image';
import React from 'react';
import type { ImageStyle, StyleProp } from 'react-native';

export interface LoginCompassLogoProps {
  accessibilityLabel?: string;
  style?: StyleProp<ImageStyle>;
}

/** Web: `expo-image` + SVG (módulo nativo no se enlaza en Android por `app.json`). */
export const LoginCompassLogo: React.FC<LoginCompassLogoProps> = ({
  accessibilityLabel = 'Compass',
  style,
}) => (
  <Image
    accessibilityLabel={accessibilityLabel}
    contentFit="contain"
    source={require('@/presentation/assets/logos/Vertical-COLOR.svg')}
    style={style}
  />
);
