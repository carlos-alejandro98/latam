import { useEffect, useRef } from 'react';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';

import { useAuthSelector } from '@/presentation/adapters/redux/use-auth-selector';
import { AppHeader } from '@/presentation/components/app-header';
import { getResolvedFlightListPanelWidth } from '@/presentation/components/flight-list';
import { TabletFlightDetail } from '@/presentation/components/tablet-flight-detail';
import { TabletFlightList } from '@/presentation/components/tablet-flight-list';
import { useAuthController } from '@/presentation/controllers/use-auth-controller';
import { useFlightListController } from '@/presentation/controllers/use-flight-list-controller';
import { useHomeController } from '@/presentation/controllers/use-home-controller';
import { useTabletFlightDetailController } from '@/presentation/controllers/use-tablet-flight-detail-controller';
import { useFlightRealtimeUpdates } from '@/presentation/hooks/use-flight-realtime-updates';
import { FlightGanttEmptyState } from '@/presentation/screens/homeScreen/components/flight-gantt-empty-state';
import type { AuthRole } from '@/store/slices/auth-slice';

import { styles } from './tablet-home-screen.styles';

export const TabletHomeScreen = () => {
  const { width } = useWindowDimensions();
  const panelWidth = getResolvedFlightListPanelWidth(width);
  const {
    flights,
    loading,
    initialLoading,
    selectedFlight,
    selectedFlightId,
    selectedFlightIds,
    openFlightSingle,
  } = useHomeController();
  const flightListController = useFlightListController({ flights });
  const tabletFlightDetail = useTabletFlightDetailController(selectedFlight);
  const { logout } = useAuthController();
  const { userName, role, userPhotoUrl } = useAuthSelector();
  const roleLabels: Record<AuthRole, string> = {
    admin: 'Admin',
    viewer: 'Viewer',
    controller: 'Controller',
    ['above_the_wing']: 'Embarque',
    ['below_the_wing']: 'DOT',
  };
  const userRoleLabel = role ? (roleLabels[role] ?? role) : '';
  const isFlightsLoading = loading || initialLoading;
  const translateX = useRef(new Animated.Value(0)).current;
  const panelPositionInitialized = useRef(false);
  useFlightRealtimeUpdates();

  useEffect(() => {
    const closedX = -panelWidth;

    if (!panelPositionInitialized.current) {
      panelPositionInitialized.current = true;
      translateX.setValue(flightListController.collapsed ? closedX : 0);
      return;
    }

    Animated.timing(translateX, {
      toValue: flightListController.collapsed ? closedX : 0,
      duration: flightListController.collapsed ? 160 : 180,
      useNativeDriver: true,
    }).start();
  }, [flightListController.collapsed, panelWidth, translateX]);

  const handleOpenFlightList = (): void => {
    flightListController.expand();
  };

  const handleSelectFlight = (flightId: string): void => {
    openFlightSingle(flightId);
    flightListController.collapse();
  };

  const handleCollapseFlightList = (): void => {
    flightListController.collapse();
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="HUB CONTROL CENTER"
        subtitle="COMPASS"
        layoutVariant="tablet"
        showMenuButton
        onMenuPress={handleOpenFlightList}
        onHelpPress={() => {}}
        onNotificationPress={() => {}}
        onAvatarPress={() => {}}
        onLogoutPress={() => {
          void logout();
        }}
        showNotification={false}
        userName={userName}
        userRole={userRoleLabel}
        userPhotoUrl={userPhotoUrl || undefined}
      />
      <View style={styles.content}>
        {selectedFlight ? (
          <TabletFlightDetail
            viewModel={tabletFlightDetail.viewModel}
            filteredTasks={tabletFlightDetail.filteredTasks}
            filterOptions={tabletFlightDetail.filterOptions}
            searchDraft={tabletFlightDetail.searchDraft}
            activeCategory={tabletFlightDetail.activeCategory}
            loading={tabletFlightDetail.loading || isFlightsLoading}
            refreshing={tabletFlightDetail.reloading}
            error={tabletFlightDetail.error}
            onBack={handleOpenFlightList}
            onSearchDraftChange={tabletFlightDetail.setSearchDraft}
            onApplySearch={tabletFlightDetail.applySearch}
            onCategoryChange={tabletFlightDetail.setActiveCategory}
            onReload={tabletFlightDetail.reload}
            taskEditModal={tabletFlightDetail.taskEditModal}
            onStartTask={tabletFlightDetail.taskActions.startTask}
            onFinishTask={tabletFlightDetail.taskActions.finishTask}
            onCompleteHito={tabletFlightDetail.taskActions.completeHitoTask}
          />
        ) : (
          <FlightGanttEmptyState />
        )}
      </View>

      <View
        style={styles.listOverlay}
        pointerEvents={flightListController.collapsed ? 'none' : 'box-none'}
      >
        {selectedFlight && !flightListController.collapsed ? (
          <Pressable
            style={styles.listBackdrop}
            onPress={handleCollapseFlightList}
          />
        ) : null}
        <Animated.View
          style={[
            styles.listPanel,
            {
              width: panelWidth,
              transform: [{ translateX }],
            },
          ]}
        >
          <TabletFlightList
            flights={flightListController.flights}
            loading={isFlightsLoading}
            searchQuery={flightListController.searchQuery}
            orderBy={flightListController.orderBy}
            selectedDateKey={flightListController.selectedDateKey}
            availableDateKeys={flightListController.availableDateKeys}
            selectedFlightId={selectedFlightId}
            selectedFlightIds={selectedFlightIds}
            onClose={handleCollapseFlightList}
            canClose
            onSearchChange={flightListController.setSearchQuery}
            onOrderChange={flightListController.setOrderBy}
            onDateChange={flightListController.setSelectedDateKey}
            onPreviousDate={flightListController.goToPreviousDate}
            onNextDate={flightListController.goToNextDate}
            onSelectFlight={handleSelectFlight}
          />
        </Animated.View>
      </View>
    </View>
  );
};
