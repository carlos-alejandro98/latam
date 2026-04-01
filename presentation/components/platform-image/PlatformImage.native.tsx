import React from 'react';
import { Image, type ImageResizeMode } from 'react-native';

import type { PlatformContentFit, PlatformImageProps } from './platform-image.types';

function contentFitToResizeMode(fit: PlatformContentFit | undefined): ImageResizeMode {
  switch (fit) {
    case 'cover':
      return 'cover';
    case 'fill':
      return 'stretch';
    case 'none':
      return 'center';
    case 'scale-down':
      return 'contain';
    case 'contain':
    default:
      return 'contain';
  }
}

/**
 * Imagen en mobile con `Image` de React Native (evita acoplar pantallas Hangar/FastImage a `expo-image`).
 * Los SVG locales vía `require` no se renderizan aquí: usar `expo-image` puntual en esa pantalla (p. ej. login).
 */
export const PlatformImage: React.FC<PlatformImageProps> = ({
  source,
  style,
  contentFit = 'contain',
  accessibilityLabel,
}) => {
  return (
    <Image
      source={source}
      style={style}
      resizeMode={contentFitToResizeMode(contentFit)}
      accessibilityLabel={accessibilityLabel}
    />
  );
};
