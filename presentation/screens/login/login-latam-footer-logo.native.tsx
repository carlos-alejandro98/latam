import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgUri } from 'react-native-svg';

import { LATAM_INVERSE_LOGO_URI } from './login-latam-footer-logo.shared';

export interface LoginLatamFooterLogoProps {
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Nativo: `Image` de RN no pinta SVG por URL. `SvgUri` descarga y parsea el SVG
 * (misma idea que separar Compass: sin depender de módulo nativo de expo-image en APK).
 */
export const LoginLatamFooterLogo: React.FC<LoginLatamFooterLogoProps> = ({
  accessibilityLabel = 'LATAM',
  style,
}) => {
  const flat = StyleSheet.flatten(style) as
    | { width?: number; height?: number }
    | undefined;
  const width = typeof flat?.width === 'number' ? flat.width : 200;
  const height = typeof flat?.height === 'number' ? flat.height : 46;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      style={[{ height, width }, style]}
    >
      <SvgUri height={height} uri={LATAM_INVERSE_LOGO_URI} width={width} />
    </View>
  );
};
