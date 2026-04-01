import { HelpOutlined } from '@hangar/react-native-icons/core/interaction/HelpOutlined';
import React, { useState, useRef } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { styles, HEADER_COLORS } from './app-header.styles';
import { HeaderAvatar } from './header-avatar';

interface HeaderActionsProps {
  layoutVariant?: 'mobile' | 'tablet';
  showNotification?: boolean;
  onHelpPress?: () => void;
  onNotificationPress?: () => void;
  onAvatarPress?: () => void;
  onLogoutPress?: () => void;
  userName?: string;
  userRole?: string;
  userPhotoUrl?: string;
}

interface DropdownPosition {
  top: number;
  right: number;
}

const actionStyles = StyleSheet.create({
  helpButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  dropdown: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    minWidth: 200,
    maxWidth: 280,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  userSection: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#F8F8FC',
    gap: 2,
  },
  userNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0D0463',
  },
  userRoleText: {
    fontSize: 11,
    fontWeight: '400',
    color: '#777777',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: '#EBEBEB',
  },
  logoutButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  logoutButtonPressed: {
    backgroundColor: '#FFF5F5',
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#CC2929',
  },
});

export const HeaderActions: React.FC<HeaderActionsProps> = ({
  layoutVariant = 'mobile',
  onHelpPress,
  onAvatarPress,
  onLogoutPress,
  userName,
  userRole,
  userPhotoUrl,
}) => {
  const isTablet = layoutVariant === 'tablet';
  const helpButtonSize = isTablet ? 36 : 24;
  const helpButtonRadius = helpButtonSize / 2;
  const helpIconSize = isTablet ? 32 : 24;
  const avatarSize = isTablet ? 40 : 28;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition>({
    top: 0,
    right: 16,
  });
  const avatarRef = useRef<View>(null);

  const handleAvatarPress = () => {
    if (avatarRef.current) {
      avatarRef.current.measureInWindow((x, y, width, height) => {
        const screenWidth = Dimensions.get('window').width;
        setDropdownPos({
          top: y + height + 6,
          right: screenWidth - (x + width),
        });
        setMenuOpen(true);
      });
    } else {
      setMenuOpen(true);
    }
    onAvatarPress?.();
  };

  const handleLogout = () => {
    setMenuOpen(false);
    onLogoutPress?.();
  };

  return (
    <View style={styles.rightSection}>
      <Pressable
        style={[
          actionStyles.helpButton,
          {
            width: helpButtonSize,
            height: helpButtonSize,
            borderRadius: helpButtonRadius,
          },
        ]}
        onPress={onHelpPress}
        accessibilityLabel="Help"
        accessibilityRole="button"
      >
        <HelpOutlined size={helpIconSize} color={HEADER_COLORS.iconDefault} />
      </Pressable>

      <View ref={avatarRef} collapsable={false}>
        <HeaderAvatar
          onPress={handleAvatarPress}
          photoUrl={userPhotoUrl}
          userName={userName}
          useBrandFallback
          size={avatarSize}
        />
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={actionStyles.modalRoot} pointerEvents="box-none">
          <Pressable
            style={actionStyles.backdrop}
            onPress={() => setMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar menú"
          />
          <View
            style={[
              actionStyles.dropdown,
              { top: dropdownPos.top, right: dropdownPos.right },
            ]}
            pointerEvents="box-none"
          >
            {(userName ?? userRole) ? (
              <View style={actionStyles.userSection}>
                {userName ? (
                  <Text style={actionStyles.userNameText} numberOfLines={1}>
                    {userName}
                  </Text>
                ) : null}
                {userRole ? (
                  <Text style={actionStyles.userRoleText}>{userRole}</Text>
                ) : null}
              </View>
            ) : null}
            {(userName ?? userRole) ? <View style={actionStyles.divider} /> : null}
            <Pressable
              style={({ pressed }) => [
                actionStyles.logoutButton,
                pressed && actionStyles.logoutButtonPressed,
              ]}
              onPress={handleLogout}
              accessibilityLabel="Cerrar sesión"
              accessibilityRole="button"
            >
              <Text style={actionStyles.logoutButtonText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};
