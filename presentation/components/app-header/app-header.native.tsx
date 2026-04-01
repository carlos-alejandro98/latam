import { MenuOutlined } from '@hangar/react-native-icons/core/interaction/MenuOutlined';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  styles,
  HEADER_COLORS,
  HEADER_HEIGHT_MOBILE,
  HEADER_HEIGHT_TABLET,
} from './app-header.styles';
import { HeaderActions } from './header-actions';
import { HeaderLogo } from './header-logo';

import type { AppHeaderProps } from './app-header.types';

/**
 * Mobile/Tablet header component (Native).
 * Respects the device safe area (notch / camera cutout / status bar).
 */
const AppHeaderComponent: React.FC<AppHeaderProps> = ({
  title = 'HUB CONTROL CENTER',
  subtitle = 'COMPASS',
  layoutVariant = 'mobile',
  showMenuButton = false,
  onMenuPress,
  onHelpPress,
  onNotificationPress,
  onAvatarPress,
  onLogoutPress,
  showNotification = false,
  userName,
  userRole,
  userPhotoUrl,
}) => {
  const insets = useSafeAreaInsets();
  const isTablet = layoutVariant === 'tablet';
  const headerHeight =
    (isTablet ? HEADER_HEIGHT_TABLET : HEADER_HEIGHT_MOBILE) + insets.top;
  const gradientStyle = isTablet
    ? styles.gradientTablet
    : styles.gradientMobile;
  const showMenu = showMenuButton;
  const menuIconSize = isTablet ? 32 : 24;
  const menuButtonSize = isTablet ? 48 : 40;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <LinearGradient
        colors={[HEADER_COLORS.gradientStart, HEADER_COLORS.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradient,
          gradientStyle,
          { height: headerHeight, paddingTop: insets.top },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.leftSection}>
            {showMenu ? (
              <View
                style={[
                  styles.menuButton,
                  { width: menuButtonSize, height: menuButtonSize },
                ]}
              >
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    styles.menuButtonIconLayer,
                  ]}
                >
                  <MenuOutlined
                    size={menuIconSize}
                    color={HEADER_COLORS.iconDefault}
                  />
                </View>
                <Pressable
                  style={StyleSheet.absoluteFillObject}
                  onPress={onMenuPress}
                  accessibilityLabel="Abrir menú"
                  accessibilityRole="button"
                />
              </View>
            ) : null}

            <View
              style={
                isTablet
                  ? styles.nativeTabletBrandGroup
                  : styles.nativeMobileBrandGroup
              }
            >
              <HeaderLogo layoutVariant={isTablet ? 'tablet' : 'mobile'} />
              {isTablet ? (
                <View style={styles.nativeTabletTitlesContainer}>
                  <Text style={styles.nativeTabletTitle}>{title}</Text>
                  <Text style={styles.nativeTabletSubtitle}>{subtitle}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <HeaderActions
            layoutVariant={isTablet ? 'tablet' : 'mobile'}
            showNotification={showNotification}
            onHelpPress={onHelpPress}
            onNotificationPress={onNotificationPress}
            onAvatarPress={onAvatarPress}
            onLogoutPress={onLogoutPress}
            userName={userName}
            userRole={userRole}
            userPhotoUrl={userPhotoUrl}
          />
        </View>
      </LinearGradient>
    </View>
  );
};

AppHeaderComponent.displayName = 'AppHeader';

export const AppHeader = memo(AppHeaderComponent);
export default AppHeader;
