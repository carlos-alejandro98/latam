import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import type { FlightGantt } from '@/domain/entities/flight-gantt';
import type { AppDispatch, RootState } from '@/store';
import {
  fetchFlightGantt,
  refreshTurnaroundMetrics,
  updateGanttData,
  optimisticUpdateTask,
} from '@/store/slices/flight-gantt-slice';

export const useFlightGanttStoreAdapter = () => {
  const dispatch = useDispatch<AppDispatch>();

  const gantt = useSelector((state: RootState) => state.flightGantt.data);
  const loading = useSelector((state: RootState) => state.flightGantt.loading);
  const error = useSelector((state: RootState) => state.flightGantt.error);
  const flightId = useSelector(
    (state: RootState) => state.flightGantt.flightId,
  );

  const loadFlightGantt = useCallback(
    (selectedFlightId: string) => dispatch(fetchFlightGantt(selectedFlightId)),
    [dispatch],
  );

  const refreshTurnaroundMetricsFn = useCallback(
    (turnaroundId: string) => dispatch(refreshTurnaroundMetrics(turnaroundId)),
    [dispatch],
  );

  const applyGanttUpdate = useCallback(
    (data: FlightGantt) => {
      console.log('[v0] applyGanttUpdate llamado — tareas:', data.tasks.length, '| flightId API:', data.flight?.flightId);
      dispatch(updateGanttData(data));
    },
    [dispatch],
  );

  const patchTask = useCallback(
    (payload: {
      instanceId: string;
      startTime?: string | null;
      endTime?: string | null;
    }) => dispatch(optimisticUpdateTask(payload)),
    [dispatch],
  );

  return {
    gantt,
    loading,
    error,
    flightId,
    loadFlightGantt,
    refreshTurnaroundMetrics: refreshTurnaroundMetricsFn,
    /** Applies a gantt update silently (no loading flash) — used by SSE stream. */
    applyGanttUpdate,
    /** Optimistically patches a single task before the backend confirms. */
    patchTask,
  };
};
