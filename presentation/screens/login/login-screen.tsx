import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

import { IS_WEB } from '@/config/platform';
import { container } from '@/dependencyInjection/container';
import { applyAuthSessionToHttpClient } from '@/infrastructure/api/axios-client';
import { Text } from '@/presentation/components/design-system';
import { useAuthController } from '@/presentation/controllers/use-auth-controller';
import type { AppDispatch } from '@/store';
import { setRole, setSession } from '@/store/slices/auth-slice';

import { LoginCompassLogo } from './login-compass-logo';
import { LoginLatamFooterLogo } from './login-latam-footer-logo';

/** Alineado con tablet vs mobile en otras pantallas nativas (p. ej. `width < 768`). */
const LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH = 768;

const LATAM_RED = '#D51146';
const CARD_BORDER_TOP = '#0D12AB';
/** Velo neutro (sin tinte azul). El overlay azul anterior teñía toda la foto y apagaba los blancos. */
const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.08)';

/**
 * OAuth login screen matching Figma design.
 * Full-screen background with centered card, LATAM branding and Azure AD login.
 * Includes role selection (Controller/Operator) for user preference.
 */
export const LoginScreen: React.FC = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { error, loading, login } = useAuthController();

  const compassLogoStyle = useMemo(() => {
    if (IS_WEB) {
      return styles.compassLogoWeb;
    }
    const isTablet = windowWidth >= LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH;
    return isTablet ? styles.compassLogoTablet : styles.compassLogoMobile;
  }, [windowWidth]);

  const welcomeTitleVariant = useMemo<
    'display-lg' | 'heading-lg' | 'heading-md'
  >(() => {
    if (IS_WEB) {
      return 'heading-md';
    }
    return windowWidth >= LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH
      ? 'display-lg'
      : 'heading-lg';
  }, [windowWidth]);

  /** "Acesse a ferramenta…": display-md solo en tablet nativa; web y mobile siguen body-lg. */
  const turnaroundTaglineVariant = useMemo<'body-lg' | 'display-md'>(() => {
    if (IS_WEB) {
      return 'body-lg';
    }
    return windowWidth >= LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH
      ? 'display-md'
      : 'body-lg';
  }, [windowWidth]);

  /** Footer: gap 24 solo en móvil nativo; web y tablet nativa siguen en 32. */
  const footerGap = useMemo(() => {
    if (IS_WEB) {
      return 32;
    }
    return windowWidth >= LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH ? 32 : 24;
  }, [windowWidth]);

  /** Copyright footer: body-lg solo en móvil nativo; web y tablet nativa heading-md. */
  const copyrightTextVariant = useMemo<'body-lg' | 'heading-md'>(() => {
    if (IS_WEB) {
      return 'heading-md';
    }
    return windowWidth >= LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH
      ? 'heading-md'
      : 'body-lg';
  }, [windowWidth]);

  /** Fondo: cover solo en móvil nativo; web y tablet nativa stretch. */
  const backdropResizeMode = useMemo<'cover' | 'stretch'>(() => {
    if (IS_WEB) {
      return 'stretch';
    }
    return windowWidth >= LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH
      ? 'stretch'
      : 'cover';
  }, [windowWidth]);

  /**
   * Área principal del card: tablet nativa marginTop 60; sin margin en web/móvil.
   * paddingTop 90 móvil nativo, 101 web.
   */
  const mainSpacingStyle = useMemo(() => {
    if (IS_WEB) {
      return { marginTop: 0, paddingTop: 101 };
    }
    if (windowWidth >= LOGIN_COMPASS_LOGO_TABLET_MIN_WIDTH) {
      return { marginTop: 60, paddingTop: 0 };
    }
    return { marginTop: 0, paddingTop: 90 };
  }, [windowWidth]);

  // Read ?error= param from URL (web only) to show specific messages after redirects.
  const urlError = useMemo<string | null>(() => {
    if (!IS_WEB || typeof window.location?.search !== 'string') {
      return null;
    }

    const param = new URLSearchParams(window.location.search).get('error');
    if (param === 'no_permissions') {
      return 'No tienes permisos para acceder a esta aplicacion. Contacta con tu administrador.';
    }
    return null;
  }, []);

  // TODO: Remove when Azure AD is configured as Single-Page Application
  const handleDevSkipLogin = async () => {
    // Create a valid mock JWT with exp claim for validation
    // Format: header.payload.signature (validator only decodes payload)
    const expiresAt = Math.floor(Date.now() / 1000) + 8 * 60 * 60; // 8 hours from now
    const mockPayload = {
      exp: expiresAt,
      oid: 'dev-mock-oid',
      email: 'dev@compass.local',
      name: 'Dev User',
      roles: ['controller'],
    };

    // Create mock JWT (header.payload.signature format)
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify(mockPayload));
    const mockJWT = `${header}.${payload}.mock-signature`;

    const mockSession = {
      accessToken: mockJWT,
      idToken: mockJWT,
      refreshToken: 'dev-mock-refresh-token',
      expiresAt: expiresAt * 1000, // Convert to milliseconds
    };

    // Save to persistent storage so AuthGuard doesn't clear it
    await container.tokenStorage.save(mockSession);

    // Set in Redux state
    dispatch(setSession(mockSession));
    dispatch(setRole('controller'));

    // Apply to HTTP client
    applyAuthSessionToHttpClient(mockSession);

    // Navigate to turnaround
    router.replace('/turnaround');
  };

  return (
    <ImageBackground
      source={require('@/presentation/assets/images/compass-login-backdrop.png')}
      style={styles.background}
      resizeMode={backdropResizeMode}
    >
      {/* Velo muy suave solo para algo de contraste; la imagen se ve casi a color real */}
      <View style={styles.overlay} />

      {/* Main: card centrado; footer aparte al pie de pantalla */}
      <View style={styles.content}>
        <View style={[styles.main, mainSpacingStyle]}>
          {/* Login Card */}
          <View style={styles.card}>
            {/* Logo placeholder */}
            <View style={styles.logoContainer}>
              <Pressable
                onPress={() => {
                  void handleDevSkipLogin();
                }}
                style={({ pressed }) => [
                  styles.devSkipButton,
                  pressed && styles.devSkipButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Skip login for testing"
              >
                <LoginCompassLogo
                  accessibilityLabel="Compass"
                  style={compassLogoStyle}
                />
              </Pressable>
            </View>

            {/* Title */}
            <Text variant={welcomeTitleVariant} style={styles.title} bold>
              Bem-vindo à Compass
            </Text>

            {/* Description */}
            <Text variant={turnaroundTaglineVariant} style={styles.description}>
              Acesse a ferramenta de gerenciamento de Turnaround
            </Text>

            <Text variant={turnaroundTaglineVariant} style={styles.description}>
              Use suas credenciais da LATAM para fazer login.
            </Text>

            {/* No-permissions error from redirect */}
            {urlError ? (
              <View style={styles.permissionsErrorBox}>
                <Text variant="body-sm" style={styles.permissionsErrorText}>
                  {urlError}
                </Text>
              </View>
            ) : null}

            {/* Auth error message */}
            {error ? (
              <Text variant="body-sm" style={styles.errorText}>
                {error}
              </Text>
            ) : null}

            {/* Login button */}
            <Pressable
              disabled={loading}
              onPress={() => {
                void login();
              }}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.loginButtonPressed,
                loading && styles.loginButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Login com sua conta LATAM"
            >
              {loading ? (
                <Text variant="label-md" style={styles.loginButtonText}>
                  Carregando...
                </Text>
              ) : (
                <Text variant="label-md" style={styles.loginButtonText}>
                  Login com sua conta LATAM.
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Footer — pegado al borde inferior del viewport */}
        <View
          style={[
            styles.footer,
            { gap: footerGap, paddingBottom: Math.max(insets.bottom, 48) },
          ]}
        >
          <View style={styles.latamBranding}>
            <LoginLatamFooterLogo style={styles.latamLogo} />
          </View>
          <Text variant={copyrightTextVariant} style={styles.copyright} bold>
            © 2026 LATAM Airlines
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: OVERLAY_COLOR,
  },
  content: {
    flex: 1,
    width: '100%',
  },
  main: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderTopWidth: 8,
    borderTopColor: CARD_BORDER_TOP,
    padding: 48,
    gap: 24,
    // width: '100%',
    // maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    // paddingVertical: 8,
    // width: '100%',
  },
  /** Web: tamaño actual sin cambios (Vertical-COLOR / viewBox 356×192). */
  compassLogoWeb: {
    width: 260,
    height: 140,
  },
  compassLogoMobile: {
    width: 205,
    height: 110,
  },
  compassLogoTablet: {
    width: 372,
    height: 200,
  },
  title: {
    color: '#000000',
    // fontWeight: '700',
    letterSpacing: 2,
  },
  description: {
    color: '#000000',
    letterSpacing: 2,
  },
  errorText: {
    color: '#D51146',
  },
  permissionsErrorBox: {
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#FFC107',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  permissionsErrorText: {
    color: '#7A4F00',
    lineHeight: 20,
  },
  loginButton: {
    backgroundColor: LATAM_RED,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  loginButtonPressed: {
    backgroundColor: '#AA0D38',
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  devSkipButton: {
    backgroundColor: 'transparent',
  },
  devSkipButtonPressed: {
    backgroundColor: '#F0F0F0',
  },
  devSkipButtonText: {
    color: '#666666',
    fontWeight: '500',
    textAlign: 'center',
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 24,
  },
  latamBranding: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  latamLogo: {
    width: 200,
    height: 46,
  },
  copyright: {
    color: '#FFFFFF',
    opacity: 0.95,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
