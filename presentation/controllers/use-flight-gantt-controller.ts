import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import type { AppDispatch } from '@/store';
import { clearGanttData, fetchFlightGantt } from '@/store/slices/flight-gantt-slice';
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
    refreshTurnaroundMetrics,
  } = storeAdapter;
  const autoLoad = options?.autoLoad ?? true;

  // Track the previous flightId to detect actual changes (avoid running the
  // effect when unrelated state causes a re-render with the same flightId).
  const prevFlightIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!flightId || !autoLoad) {
      return;
    }

    // Only clear + reload when the flightId actually changed.
    if (prevFlightIdRef.current === flightId) {
      return;
    }

    prevFlightIdRef.current = flightId;

    // Clear stale gantt data from the previous flight so the timeline doesn't
    // flash old rows while the new gantt is loading.
    dispatch(clearGanttData());

    // Dispatch directly via the thunk — avoids stale-closure issues that arise
    // when loadFlightGantt (a useCallback) is used as a dependency.
    void dispatch(fetchFlightGantt(flightId));
  // flightId and autoLoad are the only real triggers for a reload.
  // dispatch is stable; prevFlightIdRef is a ref — neither needs to be a dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightId, autoLoad]);

  return {
    gantt,
    loading,
    error,
    flightId: requestedFlightId,
    loadFlightGantt: storeAdapter.loadFlightGantt,
    refreshTurnaroundMetrics,
    patchTask: storeAdapter.patchTask,
  };
};
