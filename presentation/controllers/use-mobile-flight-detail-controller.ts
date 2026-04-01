import { useCallback, useMemo } from 'react';

import type { Flight } from '@/domain/entities/flight';
import { useGanttPolling } from '@/presentation/hooks/use-gantt-polling';
import {
  createMobileFlightDetailViewModel,
  type MobileFlightProcessViewModel,
} from '@/presentation/view-models/mobile-flight-detail-view-model';

import {
  useFlightGanttController,
} from './use-flight-gantt-controller';
import {
  useFlightTaskActions,
  type FlightTaskActionResult,
} from './use-flight-task-actions';
import {
  useTaskEditModalController,
  type TaskEditModalController,
} from './use-task-edit-modal-controller';

export type MobileTaskEditModalController =
  TaskEditModalController<MobileFlightProcessViewModel>;

const FALLBACK_TIME = '--:--';

const hasRealTime = (value: string): boolean => {
  return value !== FALLBACK_TIME;
};

const getEstimatedValue = (
  startTimeLabel: string,
  endTimeLabel: string,
  scheduledRangeLabel: string,
): string => {
  if (hasRealTime(startTimeLabel)) {
    return startTimeLabel;
  }

  if (hasRealTime(endTimeLabel)) {
    return endTimeLabel;
  }

  return scheduledRangeLabel.split(' - ')[0] ?? FALLBACK_TIME;
};

const applyOptimisticTask = (
  task: MobileFlightProcessViewModel,
  override?: FlightTaskActionResult,
): MobileFlightProcessViewModel => {
  if (!override) {
    return task;
  }

  const startTimeLabel = override.startTimeLabel ?? task.startTimeLabel;
  const endTimeLabel = override.endTimeLabel ?? task.endTimeLabel;

  return {
    ...task,
    statusTone: override.statusTone,
    statusLabel: override.statusLabel,
    startTimeLabel,
    endTimeLabel,
    durationLabel: override.durationLabel ?? task.durationLabel,
    estimatedValue: getEstimatedValue(
      startTimeLabel,
      endTimeLabel,
      task.scheduledRangeLabel,
    ),
    isStarted: hasRealTime(startTimeLabel),
    isFinished: hasRealTime(endTimeLabel),
  };
};

export const useMobileFlightDetailController = (
  flight: Flight | null,
): {
  viewModel: ReturnType<typeof createMobileFlightDetailViewModel> | null;
  reload: () => Promise<void>;
  refreshGantt: () => void;
  taskEditModal: MobileTaskEditModalController;
  taskActions: ReturnType<typeof useFlightTaskActions>;
  loading: boolean;
  error: string | undefined;
} => {
  const {
    gantt,
    loading,
    error,
    flightId: requestedFlightId,
    loadFlightGantt,
    refreshTurnaroundMetrics,
    patchTask,
    updateTaskFromApiResponse,
  } = useFlightGanttController(flight?.flightId);
  const resolvedGantt =
    flight && gantt?.flight?.flightId === flight.flightId ? gantt : null;
  const shouldUseRequestState =
    Boolean(flight) && requestedFlightId === flight?.flightId;
  const {
    startTask: startTaskMutation,
    finishTask: finishTaskMutation,
    updateTask: updateTaskMutation,
    completeHitoTask: completeHitoTaskMutation,
    optimisticTasks,
  } = useFlightTaskActions({
    flight,
    patchTask,
    updateTaskFromApiResponse,
    loadFlightGantt,
  });

  const refreshAfterTaskMutation = useCallback(async () => {
    if (!flight?.flightId) {
      return;
    }

    try {
      if (resolvedGantt?.turnaroundId) {
        await refreshTurnaroundMetrics(resolvedGantt.turnaroundId);
      }

      await loadFlightGantt(flight.flightId);
    } catch {
      // Keep the optimistic state visible; polling and delayed sync will recover.
    }
  }, [
    flight?.flightId,
    loadFlightGantt,
    refreshTurnaroundMetrics,
    resolvedGantt?.turnaroundId,
  ]);

  const startTask = useCallback(
    async (
      task: Parameters<typeof startTaskMutation>[0],
      time: Parameters<typeof startTaskMutation>[1],
    ) => {
      const result = await startTaskMutation(task, time);
      await refreshAfterTaskMutation();
      return result;
    },
    [refreshAfterTaskMutation, startTaskMutation],
  );

  const finishTask = useCallback(
    async (
      task: Parameters<typeof finishTaskMutation>[0],
      time: Parameters<typeof finishTaskMutation>[1],
    ) => {
      const result = await finishTaskMutation(task, time);
      await refreshAfterTaskMutation();
      return result;
    },
    [finishTaskMutation, refreshAfterTaskMutation],
  );

  const updateTask = useCallback(
    async (
      task: Parameters<typeof updateTaskMutation>[0],
      startTime: Parameters<typeof updateTaskMutation>[1],
      endTime: Parameters<typeof updateTaskMutation>[2],
    ) => {
      const result = await updateTaskMutation(task, startTime, endTime);
      await refreshAfterTaskMutation();
      return result;
    },
    [refreshAfterTaskMutation, updateTaskMutation],
  );

  const completeHitoTask = useCallback(
    async (
      task: Parameters<typeof completeHitoTaskMutation>[0],
      time: Parameters<typeof completeHitoTaskMutation>[1],
      onlyFinish: Parameters<typeof completeHitoTaskMutation>[2],
    ) => {
      const result = await completeHitoTaskMutation(task, time, onlyFinish);
      await refreshAfterTaskMutation();
      return result;
    },
    [completeHitoTaskMutation, refreshAfterTaskMutation],
  );

  const taskActions = useMemo(
    () => ({
      startTask,
      finishTask,
      updateTask,
      completeHitoTask,
      optimisticTasks,
    }),
    [
      completeHitoTask,
      finishTask,
      optimisticTasks,
      startTask,
      updateTask,
    ],
  );
  const { refresh: refreshGantt } = useGanttPolling(
    flight?.flightId ?? null,
    loadFlightGantt,
  );
  const taskEditModal =
    useTaskEditModalController<MobileFlightProcessViewModel>({
      flightId: flight?.flightId,
      onStartTask: startTask,
      onFinishTask: finishTask,
      onUpdateTask: updateTask,
    });

  const viewModel = useMemo(() => {
    if (!flight) {
      return null;
    }

    const baseViewModel = createMobileFlightDetailViewModel(flight, resolvedGantt);

    return {
      ...baseViewModel,
      processCards: baseViewModel.processCards.map((task) =>
        applyOptimisticTask(task, optimisticTasks[task.instanceId]),
      ),
    };
  }, [flight, optimisticTasks, resolvedGantt]);

  const reload = useCallback(async (): Promise<void> => {
    await refreshAfterTaskMutation();
  }, [refreshAfterTaskMutation]);

  return {
    viewModel,
    reload,
    refreshGantt,
    taskEditModal,
    taskActions,
    loading: shouldUseRequestState ? loading : false,
    error: shouldUseRequestState ? error : undefined,
  };
};
