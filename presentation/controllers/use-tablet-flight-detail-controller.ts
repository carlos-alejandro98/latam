import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { Flight } from '@/domain/entities/flight';
import { useGanttPolling } from '@/presentation/hooks/use-gantt-polling';
import { useMinuteTimestamp } from '@/presentation/hooks/use-minute-timestamp';
import {
  createTabletFlightDetailViewModel,
  type TabletTaskCategory,
  type TabletFlightTaskViewModel,
} from '@/presentation/view-models/tablet-flight-detail-view-model';

import { useFlightGanttController } from './use-flight-gantt-controller';
import {
  useFlightTaskActions,
  type FlightTaskActionResult,
} from './use-flight-task-actions';
import {
  useTaskEditModalController,
  type TaskEditModalController,
} from './use-task-edit-modal-controller';

const TABLET_TASK_FILTERS: Array<{
  id: TabletTaskCategory;
  label: string;
}> = [
  { id: 'all', label: 'Todos' },
  { id: 'aircraft', label: 'Aeronave' },
  { id: 'services', label: 'Servicios' },
  { id: 'cargo', label: 'Carga' },
];

const FALLBACK_TIME = '--:--';

const applyOptimisticTask = (
  task: TabletFlightTaskViewModel,
  override?: FlightTaskActionResult,
): TabletFlightTaskViewModel => {
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
    realStartTime: startTimeLabel === FALLBACK_TIME ? null : startTimeLabel,
    realEndTime: endTimeLabel === FALLBACK_TIME ? null : endTimeLabel,
  };
};

export const useTabletFlightDetailController = (
  flight: Flight | null,
): {
  viewModel: ReturnType<typeof createTabletFlightDetailViewModel> | null;
  filteredTasks: TabletFlightTaskViewModel[];
  filterOptions: Array<{ id: TabletTaskCategory; label: string }>;
  searchDraft: string;
  setSearchDraft: Dispatch<SetStateAction<string>>;
  activeCategory: TabletTaskCategory;
  setActiveCategory: Dispatch<SetStateAction<TabletTaskCategory>>;
  applySearch: () => void;
  reload: () => Promise<void>;
  refreshGantt: () => void;
  patchTask: ReturnType<typeof useFlightGanttController>['patchTask'];
  taskEditModal: TaskEditModalController<TabletFlightTaskViewModel>;
  taskActions: ReturnType<typeof useFlightTaskActions>;
  loadFlightGantt: ReturnType<typeof useFlightGanttController>['loadFlightGantt'];
  reloading: boolean;
  flightId: string | null;
  std: string | null;
  loading: boolean;
  error: string | undefined;
} => {
  const nowTimestamp = useMinuteTimestamp();
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
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isReloading, setIsReloading] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<TabletTaskCategory>('all');

  useEffect(() => {
    setSearchDraft('');
    setSearchQuery('');
    setActiveCategory('all');
  }, [flight?.flightId]);

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

  const viewModel = useMemo(() => {
    if (!flight) {
      return null;
    }

    const baseViewModel = createTabletFlightDetailViewModel(
      flight,
      resolvedGantt,
      nowTimestamp,
    );

    return {
      ...baseViewModel,
      tasks: baseViewModel.tasks.map((task) =>
        applyOptimisticTask(task, optimisticTasks[task.instanceId]),
      ),
    };
  }, [flight, nowTimestamp, optimisticTasks, resolvedGantt]);

  const filteredTasks = useMemo(() => {
    if (!viewModel) {
      return [];
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();

    return viewModel.tasks.filter((task) => {
      const matchesCategory =
        activeCategory === 'all' || task.category === activeCategory;
      const matchesSearch =
        !normalizedQuery || task.searchText.includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery, viewModel]);

  const applySearch = useCallback(() => {
    setSearchQuery(searchDraft);
  }, [searchDraft]);

  const reload = useCallback(async () => {
    if (!flight?.flightId || isReloading) {
      return;
    }

    setIsReloading(true);

    try {
      if (resolvedGantt?.turnaroundId) {
        await refreshTurnaroundMetrics(resolvedGantt.turnaroundId);
      }

      await loadFlightGantt(flight.flightId);
    } finally {
      setIsReloading(false);
    }
  }, [
    flight?.flightId,
    isReloading,
    loadFlightGantt,
    refreshTurnaroundMetrics,
    resolvedGantt?.turnaroundId,
  ]);

  // Periodic polling — refreshes gantt automatically every ENV.ganttPollingIntervalMs
  const { refresh: refreshGantt } = useGanttPolling(flight?.flightId ?? null, loadFlightGantt);
  const taskEditModal = useTaskEditModalController<TabletFlightTaskViewModel>({
    flightId: flight?.flightId,
    onStartTask: startTask,
    onFinishTask: finishTask,
    onUpdateTask: updateTask,
  });

  return {
    viewModel,
    filteredTasks,
    filterOptions: TABLET_TASK_FILTERS,
    searchDraft,
    setSearchDraft,
    activeCategory,
    setActiveCategory,
    applySearch,
    reload,
    refreshGantt,
    patchTask,
    taskEditModal,
    taskActions,
    loadFlightGantt,
    reloading: isReloading,
    flightId: flight?.flightId ?? null,
    std: flight?.stdTime ?? null,
    loading: shouldUseRequestState ? loading : false,
    error: shouldUseRequestState ? error : undefined,
  };
};
