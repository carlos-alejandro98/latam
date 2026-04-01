import { CloseOutlined } from '@hangar/react-icons/core/interaction';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from 'react-native';

import { ButtonAdapter } from '@/presentation/adapters/ui/button';
import { Text } from '@/presentation/components/design-system';
import { AppHeader } from '@/presentation/components/app-header';
import { FlightInfoPanel } from '@/presentation/components/flight-info-panel';
import {
  canManageFlightTaskActions,
  VIEWER_TASK_ACTION_RESTRICTION_MESSAGE,
} from '@/domain/services/flight-task-permissions';
import {
  FlightList,
  getResolvedFlightListPanelWidth,
} from '@/presentation/components/flight-list';
import { useFlightRealtimeUpdates } from '@/presentation/hooks/use-flight-realtime-updates';
import { useCommentsDrawerController } from '@/presentation/controllers/use-comments-drawer-controller';
import { useFlightInfoPanelController } from '@/presentation/controllers/use-flight-info-panel-controller';
import { useFlightListController } from '@/presentation/controllers/use-flight-list-controller';
import { useHomeController } from '@/presentation/controllers/use-home-controller';
import { useAuthController } from '@/presentation/controllers/use-auth-controller';
import { useAuthSelector } from '@/presentation/adapters/redux/use-auth-selector';
import type { AuthRole } from '@/store/slices/auth-slice';
import { useFlightGanttController } from '@/presentation/controllers/use-flight-gantt-controller';
import { CommentsDrawer } from '@/presentation/screens/homeScreen/components/comments-drawer';
import type {
  SelectedProcess,
  SavedBarData,
} from '@/presentation/screens/homeScreen/components/comments-drawer/comments-drawer.types';
import { FlightGanttEmptyState } from '@/presentation/screens/homeScreen/components/flight-gantt-empty-state';
import { styles } from '@/presentation/screens/homeScreen/home-screen.styles';
import type { TimelineTaskRowData } from '@/presentation/components/flight-gantt-timeline/flight-gantt-timeline.types';
import {
  formatRelativeMinute,
  formatGanttDateTime,
} from '@/presentation/components/flight-gantt-timeline/flight-gantt-timeline.utils';
import {
  startTask,
  finishTask,
  updateTaskTimes,
} from '@/infrastructure/api/task-events-api';
import { useDispatch } from 'react-redux';
import { addSessionEvent } from '@/store/slices/session-events-slice';
import type { AppDispatch } from '@/store';
import { useTheme } from 'styled-components';

const TABLET_MAX_WIDTH = 1440;

export const HomeScreen = () => {
  const EMPTY_STATE_OFFSET = 0;
  const INFO_PANEL_OFFSET = 0;
  const { width } = useWindowDimensions();
  const flightListPanelWidth = getResolvedFlightListPanelWidth(width);
  const theme = useTheme();

  const isMobileOrTablet = width <= TABLET_MAX_WIDTH;

  const {
    flights,
    loading,
    selectedFlight,
    selectedFlightId,
    selectedFlightIds,
    selectFlight,
    closeFlight,
  } = useHomeController();
  const flightListController = useFlightListController({ flights });
  const flightInfoPanel = useFlightInfoPanelController(selectedFlight);
  const { patchTask, loading: ganttLoading } = useFlightGanttController(
    selectedFlight?.flightId,
    { autoLoad: false },
  );
  const dispatch = useDispatch<AppDispatch>();
  const [selectedProcess, setSelectedProcess] =
    useState<SelectedProcess | null>(null);
  const commentsDrawer = useCommentsDrawerController(
    selectedProcess?.taskInstanceId ?? null,
  );

  // Persist full task state across modal open/close — keyed by taskInstanceId
  const taskCacheRef = useRef<Map<string, SelectedProcess>>(new Map());
  const { logout } = useAuthController();
  const { userName, role, userPhotoUrl } = useAuthSelector();

  const roleLabels: Record<AuthRole, string> = {
    admin: 'Admin',
    viewer: 'Viewer',
    controller: 'Controller',
    above_the_wing: 'Embarque',
    below_the_wing: 'DOT',
  };
  const userRoleLabel = role ? (roleLabels[role] ?? role) : '';

  // Keep a stable ref to openDrawer so handleRowClick never captures a stale closure
  const openDrawerRef = useRef(commentsDrawer.openDrawer);
  openDrawerRef.current = commentsDrawer.openDrawer;
  const canManageTaskActions = canManageFlightTaskActions(role);

  /**
   * Builds a composite cache key combining the active gantt (flightId) and
   * the task identifier so that the same taskId in different gantts never
   * shares cached state. e.g. "TATA320-CARGO-ARR::PAX-TEAM-ATW"
   */
  const cacheKey = useCallback(
    (taskId: string) => `${selectedFlightId ?? '_'}::${taskId}`,
    [selectedFlightId],
  );

  const handleRowClick = useCallback(
    (rowData: TimelineTaskRowData): void => {
      // instanceId is the unique key required by /start and /finish endpoints
      // e.g. "TATA320-CARGO-ARR-BTW-LA3620-2026-03-02", not just "CARGO-ARR-BTW"
      const instanceId = rowData.task.instanceId;
      const key = cacheKey(instanceId);
      const cached = taskCacheRef.current.get(key);

      // Log para diagnóstico de estado de tarea
      console.log('[handleRowClick] Task data:', {
        taskName: rowData.task.taskName,
        instanceId,
        estado: rowData.task.estado,
        inicioReal: rowData.task.inicioReal,
        finReal: rowData.task.finReal,
        realRange: rowData.realRange,
      });

      if (cached) {
        // Re-opening a task that was already interacted with — restore full cached state
        setSelectedProcess(cached);
      } else {
        // Prefer real times if they exist, fall back to estimated (calculated) times
        const realStart = formatGanttDateTime(rowData.task.inicioReal);
        const realEnd = formatGanttDateTime(rowData.task.finReal);
        const calcStart = formatRelativeMinute(
          rowData.calculatedRange?.startMinute ?? null,
        );
        const calcEnd = formatRelativeMinute(
          rowData.calculatedRange?.endMinute ?? null,
        );

        const resolveTime = (real: string | null, calc: string): string => {
          if (real && real !== '00:00') return real;
          return calc === '--' ? '' : calc;
        };

        // Determinar el estado basado en inicioReal/finReal si el backend no lo envía correctamente
        let resolvedStatus = rowData.task.estado;
        if (rowData.task.inicioReal && rowData.task.finReal) {
          resolvedStatus = 'COMPLETED';
        } else if (rowData.task.inicioReal && !rowData.task.finReal) {
          resolvedStatus = 'IN_PROGRESS';
        }

        console.log('[handleRowClick] Resolved status:', resolvedStatus, 'Original:', rowData.task.estado);

        setSelectedProcess({
          name: rowData.task.taskName,
          startTime: resolveTime(realStart, calcStart),
          endTime: resolveTime(realEnd, calcEnd),
          taskInstanceId: instanceId,
          taskStatus: resolvedStatus,
          plannedStartTime: calcStart === '--' ? undefined : calcStart,
          plannedEndTime: calcEnd === '--' ? undefined : calcEnd,
          tipoEvento: rowData.task.tipoEvento,
        });
      }
      openDrawerRef.current();
    },
    [cacheKey],
  );

  /**
   * Returns the difference in minutes between two "HH:mm" strings.
   * Positive = actual is later than planned (delayed). Negative = early.
   */
  const calcDelayMinutes = useCallback(
    (actual: string, planned: string | undefined): number => {
      if (!planned) return 0;
      const toMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      return toMins(actual) - toMins(planned);
    },
    [],
  );

  const resolveUpdatedTimeChange = useCallback(
    (
      previousStartTime?: string | null,
      previousEndTime?: string | null,
      plannedStartTime?: string | null,
      plannedEndTime?: string | null,
      nextStartTime?: string | null,
      nextEndTime?: string | null,
    ): { previousTime: string | null; nextTime: string | null } => {
      const normalize = (value?: string | null): string | null => {
        const trimmed = value?.trim();

        if (!trimmed || trimmed === '--:--' || trimmed === '----') {
          return null;
        }

        return trimmed;
      };

      const previousStart = normalize(previousStartTime);
      const previousEnd = normalize(previousEndTime);
      const plannedStart = normalize(plannedStartTime);
      const plannedEnd = normalize(plannedEndTime);
      const nextStart = normalize(nextStartTime);
      const nextEnd = normalize(nextEndTime);

      if (nextEnd && nextEnd !== previousEnd) {
        return { previousTime: previousEnd ?? plannedEnd, nextTime: nextEnd };
      }

      if (nextStart && nextStart !== previousStart) {
        return { previousTime: previousStart ?? plannedStart, nextTime: nextStart };
      }

      return {
        previousTime: previousEnd ?? previousStart ?? plannedEnd ?? plannedStart,
        nextTime: nextEnd ?? nextStart,
      };
    },
    [],
  );

  const handleStartTask = useCallback(
    async (taskInstanceId: string, time: string): Promise<void> => {
      if (!canManageTaskActions) {
        throw new Error(VIEWER_TASK_ACTION_RESTRICTION_MESSAGE);
      }

      const key = cacheKey(taskInstanceId);
      console.log('[HomeScreen] handleStartTask — INIT | instanceId:', taskInstanceId, '| time:', time, '| flightId:', selectedFlight?.flightId);
      patchTask({ instanceId: taskInstanceId, startTime: time });
      try {
        const response = await startTask(
          taskInstanceId,
          time,
          selectedFlight?.std ?? null,
        );
        console.log('[HomeScreen] handleStartTask — SUCCESS | instanceId:', taskInstanceId, '| status_anterior:', response.status_anterior, '| status_nuevo:', response.status_nuevo, '| actual_start:', response.actual_start);
        const newStatus = response.status_nuevo ?? 'IN_PROGRESS';
        setSelectedProcess((prev) => {
          const updated = prev
            ? { ...prev, startTime: time, taskStatus: newStatus }
            : prev;
          if (updated) taskCacheRef.current.set(key, updated);
          return updated;
        });
        const delay = calcDelayMinutes(time, selectedProcess?.plannedStartTime);
        dispatch(
          addSessionEvent({
            type: 'started',
            taskInstanceId,
            taskName: selectedProcess?.name ?? taskInstanceId,
            time,
            timestamp: Date.now(),
            flightId: selectedFlight?.flightId ?? '',
            isDelayed: delay > 0,
            delayMinutes: Math.abs(delay),
          }),
        );
      } catch (err) {
        console.error('[HomeScreen] handleStartTask — ERROR | instanceId:', taskInstanceId, '| error:', err);
        patchTask({ instanceId: taskInstanceId, startTime: undefined });
        setSelectedProcess((prev) =>
          prev ? { ...prev, taskStatus: 'error' } : prev,
        );
      }
    },
    [
      cacheKey,
      canManageTaskActions,
      selectedFlight?.std,
      selectedFlight?.flightId,
      selectedProcess,
      patchTask,
      dispatch,
      calcDelayMinutes,
    ],
  );

  const handleFinishTask = useCallback(
    async (taskInstanceId: string, time: string): Promise<void> => {
      if (!canManageTaskActions) {
        throw new Error(VIEWER_TASK_ACTION_RESTRICTION_MESSAGE);
      }

      const key = cacheKey(taskInstanceId);
      console.log('[HomeScreen] handleFinishTask — INIT | instanceId:', taskInstanceId, '| time:', time, '| flightId:', selectedFlight?.flightId);
      patchTask({ instanceId: taskInstanceId, endTime: time });
      try {
        const response = await finishTask(
          taskInstanceId,
          time,
          selectedFlight?.std ?? null,
        );
        console.log('[HomeScreen] handleFinishTask — SUCCESS | instanceId:', taskInstanceId, '| status_anterior:', response.status_anterior, '| status_nuevo:', response.status_nuevo, '| actual_end:', response.actual_end);
        const newStatus = response.status_nuevo ?? 'COMPLETED';
        setSelectedProcess((prev) => {
          const updated = prev
            ? { ...prev, endTime: time, taskStatus: newStatus }
            : prev;
          if (updated) taskCacheRef.current.set(key, updated);
          return updated;
        });
        const delay = calcDelayMinutes(time, selectedProcess?.plannedEndTime);
        dispatch(
          addSessionEvent({
            type: 'finished',
            taskInstanceId,
            taskName: selectedProcess?.name ?? taskInstanceId,
            time,
            timestamp: Date.now(),
            flightId: selectedFlight?.flightId ?? '',
            isDelayed: delay > 0,
            delayMinutes: Math.abs(delay),
          }),
        );
      } catch (err) {
        console.error('[HomeScreen] handleFinishTask — ERROR | instanceId:', taskInstanceId, '| error:', err);
        patchTask({ instanceId: taskInstanceId, endTime: undefined });
        setSelectedProcess((prev) =>
          prev ? { ...prev, taskStatus: 'error' } : prev,
        );
      }
    },
    [
      cacheKey,
      canManageTaskActions,
      selectedFlight?.std,
      selectedFlight?.flightId,
      selectedProcess,
      patchTask,
      dispatch,
      calcDelayMinutes,
    ],
  );

  // "Actualizar" — sends updated actualStart/actualEnd + status via PATCH.
  // Status derived from inputs: both filled → COMPLETED, only start → IN_PROGRESS.
  const handleUpdateTask = useCallback(
    async (
      taskInstanceId: string,
      newStartTime: string,
      newEndTime: string,
    ): Promise<void> => {
      if (!canManageTaskActions) {
        throw new Error(VIEWER_TASK_ACTION_RESTRICTION_MESSAGE);
      }

      const key = cacheKey(taskInstanceId);
      console.log('[HomeScreen] handleUpdateTask — INIT | instanceId:', taskInstanceId, '| newStartTime:', newStartTime, '| newEndTime:', newEndTime, '| flightId:', selectedFlight?.flightId);
      patchTask({
        instanceId: taskInstanceId,
        startTime: newStartTime,
        endTime: newEndTime,
      });
      try {
        await updateTaskTimes(
          taskInstanceId,
          newStartTime || null,
          newEndTime || null,
          selectedFlight?.std ?? null,
        );
        console.log('[HomeScreen] handleUpdateTask — SUCCESS | instanceId:', taskInstanceId, '| newStartTime:', newStartTime, '| newEndTime:', newEndTime);
        taskCacheRef.current.delete(key);
        const frontendStatus = newEndTime
          ? 'COMPLETADA'
          : newStartTime
            ? 'EN_PROGRESO'
            : 'PENDIENTE';
        setSelectedProcess((prev) =>
          prev
            ? {
                ...prev,
                startTime: newStartTime,
                endTime: newEndTime,
                taskStatus: frontendStatus,
              }
            : prev,
        );
        const delayStart = calcDelayMinutes(
          newStartTime,
          selectedProcess?.plannedStartTime,
        );
        const delayEnd = calcDelayMinutes(
          newEndTime,
          selectedProcess?.plannedEndTime,
        );
        const worstDelay = Math.max(delayStart, delayEnd);
        const updatedTimes = resolveUpdatedTimeChange(
          selectedProcess?.startTime,
          selectedProcess?.endTime,
          selectedProcess?.plannedStartTime,
          selectedProcess?.plannedEndTime,
          newStartTime,
          newEndTime,
        );
        dispatch(
          addSessionEvent({
            type: 'updated',
            taskInstanceId,
            taskName: selectedProcess?.name ?? taskInstanceId,
            time: updatedTimes.nextTime ?? newStartTime ?? newEndTime ?? '',
            previousTime: updatedTimes.previousTime,
            nextTime: updatedTimes.nextTime,
            timestamp: Date.now(),
            flightId: selectedFlight?.flightId ?? '',
            isDelayed: worstDelay > 0,
            delayMinutes: Math.abs(worstDelay),
          }),
        );
      } catch (err) {
        console.error('[HomeScreen] handleUpdateTask — ERROR | instanceId:', taskInstanceId, '| error:', err);
        patchTask({
          instanceId: taskInstanceId,
          startTime: undefined,
          endTime: undefined,
        });
        throw new Error('No se pudo actualizar la tarea. Intenta de nuevo.');
      }
    },
    [
      cacheKey,
      canManageTaskActions,
      selectedFlight?.std,
      selectedFlight?.flightId,
      selectedProcess,
      patchTask,
      dispatch,
      calcDelayMinutes,
      resolveUpdatedTimeChange,
    ],
  );

  useFlightRealtimeUpdates();

  const interactionSoftDefault =
    theme?.tokens?.color?.interaction?.softDefault ?? '#2c31c9';
  const tabHoverBackground = '#e0e0e0';
  const tabUnderlineColor =
    theme?.tokens?.color?.interaction?.softDefault ?? '#0a0e80';
  const closeIconColor = theme?.tokens?.color?.icon?.primary ?? '#3a3a3a';
  const textSecondary = theme?.tokens?.color?.text?.secondary ?? '#303030';
  const tabsScrollRef = useRef<ScrollView | null>(null);
  const tabsScrollX = useRef(0);

  const selectedFlights = useMemo(
    () =>
      selectedFlightIds
        .map((flightId) =>
          flights.find((flight) => flight.flightId === flightId),
        )
        .filter((flight): flight is NonNullable<typeof flight> =>
          Boolean(flight),
        ),
    [flights, selectedFlightIds],
  );

  const getTabLabel = (flight: (typeof selectedFlights)[number]) => {
    const numberArrival = flight.numberArrival;
    const numberDeparture = flight.numberDeparture;
    if (numberArrival && numberDeparture) {
      return `${numberArrival} - ${numberDeparture}`;
    }

    return flight.flightId;
  };

  const handleTabsScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ): void => {
    tabsScrollX.current = event.nativeEvent.contentOffset.x;
  };

  const handleTabsWheel = (event: {
    nativeEvent?: { deltaX?: number; deltaY?: number };
  }): void => {
    if (Platform.OS !== 'web') return;
    const delta = event.nativeEvent?.deltaX ?? event.nativeEvent?.deltaY ?? 0;
    if (!delta) return;
    const nextX = tabsScrollX.current + delta;
    tabsScrollRef.current?.scrollTo?.({ x: nextX, animated: false });
    tabsScrollX.current = nextX;
  };

  type ScrollViewWithWheel = ScrollViewProps & {
    onWheel?: (event: {
      nativeEvent?: { deltaX?: number; deltaY?: number };
    }) => void;
  };

  const wheelProps =
    Platform.OS === 'web'
      ? ({ onWheel: handleTabsWheel } as ScrollViewWithWheel)
      : {};

  return (
    <View style={styles.container}>
      <AppHeader
        title="HUB CONTROL CENTER"
        subtitle="COMPASS"
        showMenuButton={isMobileOrTablet}
        onMenuPress={flightListController.toggleCollapsed}
        onHelpPress={() => {}}
        onNotificationPress={() => {}}
        onAvatarPress={() => {}}
        onLogoutPress={() => {
          void logout();
        }}
        showNotification
        userName={userName}
        userRole={userRoleLabel}
        userPhotoUrl={userPhotoUrl || undefined}
      />
      <View style={styles.mainWrapper}>
        <FlightList
          flights={flightListController.flights}
          loading={loading}
          collapsed={flightListController.collapsed}
          searchQuery={flightListController.searchQuery}
          orderBy={flightListController.orderBy}
          selectedDateKey={flightListController.selectedDateKey}
          availableDateKeys={flightListController.availableDateKeys}
          selectedFlightId={selectedFlightId}
          selectedFlightIds={selectedFlightIds}
          panelWidth={flightListPanelWidth}
          onToggleCollapse={flightListController.toggleCollapsed}
          onSearchChange={flightListController.setSearchQuery}
          onOrderChange={flightListController.setOrderBy}
          onDateChange={flightListController.setSelectedDateKey}
          onPreviousDate={flightListController.goToPreviousDate}
          onNextDate={flightListController.goToNextDate}
          onSelectFlight={selectFlight}
        />
        <View style={styles.content}>
          {selectedFlights.length ? (
            <View style={styles.tabsWrapper}>
              <ScrollView
                {...wheelProps}
                horizontal
                showsHorizontalScrollIndicator={false}
                persistentScrollbar={false}
                style={styles.tabsScroll}
                contentContainerStyle={styles.tabsContent}
                ref={tabsScrollRef}
                onScroll={handleTabsScroll}
                scrollEventThrottle={16}
              >
                {selectedFlights.map((flight) => {
                  const isActive = flight.flightId === selectedFlightId;
                  const label = getTabLabel(flight);
                  return (
                    <Pressable
                      key={flight.flightId}
                      onPress={() => selectFlight(flight.flightId)}
                      style={({ hovered, pressed }) => ({
                        ...styles.tab,
                        ...(isActive
                          ? {
                              ...styles.tabActive,
                              borderBottomColor: tabUnderlineColor,
                            }
                          : {}),
                        ...(hovered || pressed
                          ? {
                              ...styles.tabHover,
                              backgroundColor: tabHoverBackground,
                            }
                          : {}),
                      })}
                    >
                      {({ hovered, pressed }) => (
                        <>
                          <Text
                            variant="label-sm"
                            style={{
                              ...styles.tabLabel,
                              color: isActive
                                ? interactionSoftDefault
                                : textSecondary,
                            }}
                          >
                            {label}
                          </Text>
                          <Pressable
                            onPress={(event) => {
                              event.stopPropagation();
                              closeFlight(flight.flightId);
                            }}
                            style={({
                              hovered: closeHovered,
                              pressed: closePressed,
                            }) => [
                              styles.tabClose,
                              hovered || pressed || closeHovered || closePressed
                                ? styles.tabCloseVisible
                                : styles.tabCloseHidden,
                            ]}
                            accessibilityLabel={`Cerrar ${label}`}
                          >
                            <CloseOutlined size={16} color={closeIconColor} />
                          </Pressable>
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <View style={styles.placeholder}>
            <View
              style={[
                selectedFlight ? styles.infoPanelCard : styles.emptyStateCard,
                {
                  marginTop: selectedFlight
                    ? INFO_PANEL_OFFSET
                    : EMPTY_STATE_OFFSET,
                },
              ]}
            >
              {selectedFlight ? (
                <FlightInfoPanel
                  viewModel={flightInfoPanel.viewModel}
                  loading={flightInfoPanel.loading}
                  error={flightInfoPanel.error}
                  onRowClick={handleRowClick}
                />
              ) : (
                <FlightGanttEmptyState />
              )}
            </View>
          </View>
        </View>
      </View>
      <View style={styles.commentsDrawerButtonWrapper}>
        {/* <ButtonAdapter
          id="logout-button"
          label="Cerrar sesión"
          onPress={() => {
            void logout();
          }}
          size="compact"
          variant="secondary"
        /> */}
      </View>
      <CommentsDrawer
        isOpen={commentsDrawer.isOpen}
        drawerWidth={flightListPanelWidth}
        comments={commentsDrawer.comments}
        loading={commentsDrawer.loading}
        submitting={commentsDrawer.submitting}
        draftComment={commentsDrawer.draftComment}
        canComment={commentsDrawer.canComment}
        canSendComment={commentsDrawer.canSubmitComment}
        canManageTaskActions={canManageTaskActions}
        error={commentsDrawer.error}
        selectedProcess={selectedProcess}
        onClose={commentsDrawer.closeDrawer}
        onChangeDraftComment={commentsDrawer.changeDraftComment}
        onSendComment={commentsDrawer.submitComment}
        ganttLoading={ganttLoading}
        onStartTask={handleStartTask}
        onFinishTask={handleFinishTask}
        onUpdateTask={handleUpdateTask}
      />
    </View>
  );
};
