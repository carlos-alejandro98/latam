import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import type { AppDispatch } from '@/store';
import { fetchFlightGantt } from '@/store/slices/flight-gantt-slice';
import { useFlightGanttStoreAdapter } from '../adapters/redux/flight-gantt-store-adapter';

interface UseFlightGanttControllerOptions {
  autoLoad?: boolean;
}

export const useFlightGanttController = (
  flightId?: string,
  options?: UseFlightGanttControllerOptions,
) => {
  const dispatch = useDispatch<AppDispatch>();
  const storeAdapter = useFlightGanttStoreAdapter();
  const {
    gantt,
    loading,
    error,
    flightId: requestedFlightId,
    loadFlightGantt,
    refreshTurnaroundMetrics,
  } = storeAdapter;
  const autoLoad = options?.autoLoad ?? true;
  const emptyRetryCountRef = useRef(0);
  const lastRetryFlightIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
   if (!flightId || !autoLoad) {
     if (flightId && !autoLoad) {
       console.log(`[GanttController] autoLoad=false — fetch omitido para flightId: "${flightId}"`);
     }
     return;
   }
   console.log(`[GanttController] 🚀 Disparando fetchFlightGantt para flightId: "${flightId}"`);
   const promise = dispatch(fetchFlightGantt(flightId));
    return () => {
     console.log(`[GanttController] 🔄 Cleanup — abortando fetch de flightId: "${flightId}"`);
      promise.abort();
    };
  }, [flightId, autoLoad, dispatch]);

  useEffect(() => {
    if (!flightId || !autoLoad) {
      emptyRetryCountRef.current = 0;
      lastRetryFlightIdRef.current = flightId;
      return;
    }

    if (lastRetryFlightIdRef.current !== flightId) {
      emptyRetryCountRef.current = 0;
      lastRetryFlightIdRef.current = flightId;
    }

    const sameFlight = requestedFlightId === flightId;
    const tasksCount = gantt?.tasks.length ?? 0;
    const canRetry =
      sameFlight &&
      !loading &&
      !error &&
      tasksCount === 0 &&
      emptyRetryCountRef.current < 3;

    if (!canRetry) {
      return;
    }

    emptyRetryCountRef.current += 1;
    const attempt = emptyRetryCountRef.current;
    console.warn(
      `[GanttController] ⚠️  Gantt vacía para flightId "${flightId}" tras carga. Reintento de recuperación ${attempt}/3 en 1000ms`,
    );

    const timer = setTimeout(() => {
      void dispatch(fetchFlightGantt(flightId));
    }, 1000);

    return () => clearTimeout(timer);
  }, [flightId, autoLoad, requestedFlightId, gantt, loading, error, dispatch]);

  return {
    gantt,
    loading,
    error,
    flightId: requestedFlightId,
    loadFlightGantt,
    refreshTurnaroundMetrics,
    patchTask: storeAdapter.patchTask,
  };
};
