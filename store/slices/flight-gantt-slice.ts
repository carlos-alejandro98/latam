import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { container } from '@/dependencyInjection/container';
import type { FlightGantt, GanttDateTime } from '@/domain/entities/flight-gantt';

export const fetchFlightGantt = createAsyncThunk(
  'flightGantt/fetchByFlightId',
  async (flightId: string, { signal }) => {
    return container.getFlightGanttUseCase.execute(flightId, signal);
  },
);

export const refreshTurnaroundMetrics = createAsyncThunk(
  'flightGantt/refreshTurnaroundMetrics',
  async (turnaroundId: string) => {
    await container.refreshTurnaroundMetricsUseCase.execute(turnaroundId);
    return turnaroundId;
  },
);

interface FlightGanttState {
  data: FlightGantt | null;
  loading: boolean;
  error?: string;
  flightId?: string;
}

const initialState: FlightGanttState = {
  data: null,
  loading: false,
};

interface OptimisticTaskPayload {
  instanceId: string;
  /** "HH:mm" — undefined means don't touch this field */
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * Converts "HH:mm" into a GanttDateTime tuple [year,month,day,hour,minute].
 *
 * Uses `refDateTime` (typically the task's `inicioProgramado`) to obtain the
 * correct calendar date so that the bar lands in the right viewport position
 * even for cross-midnight flights.  Falls back to today only when no
 * reference is available.
 *
 * Cross-midnight handling: if the reference hour is late (>=20) and the
 * entered hour is early (<=4) the calendar date is advanced by one day.
 */
const hhmmToGanttDateTime = (
  hhmm: string,
  refDateTime?: GanttDateTime | null,
): FlightGantt['tasks'][0]['inicioReal'] => {
  const parts = hhmm.split(':').map(Number);
  const h = isFinite(parts[0]) ? parts[0] : 0;
  const m = isFinite(parts[1]) ? parts[1] : 0;

  let year: number;
  let month: number;
  let day: number;

  if (refDateTime && refDateTime.length >= 3) {
    year  = refDateTime[0];
    month = refDateTime[1];
    day   = refDateTime[2];

    // Cross-midnight: reference hour is late, entered hour is early
    const refHour = refDateTime[3] ?? 0;
    if (refHour >= 20 && h <= 4) {
      const d = new Date(year, month - 1, day + 1);
      year  = d.getFullYear();
      month = d.getMonth() + 1;
      day   = d.getDate();
    }
  } else {
    const now = new Date();
    year  = now.getFullYear();
    month = now.getMonth() + 1;
    day   = now.getDate();
  }

  return [year, month, day, h, m] as unknown as FlightGantt['tasks'][0]['inicioReal'];
};

const diffMinutes = (
  start: FlightGantt['tasks'][0]['inicioReal'],
  end: FlightGantt['tasks'][0]['finReal'],
): number | null => {
  if (!start || !end) {
    return null;
  }

  const [startYear, startMonth, startDay, startHour, startMinute] = start;
  const [endYear, endMonth, endDay, endHour, endMinute] = end;
  const startDate = new Date(
    startYear,
    startMonth - 1,
    startDay,
    startHour,
    startMinute,
  );
  const endDate = new Date(endYear, endMonth - 1, endDay, endHour, endMinute);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / 60000),
  );
};

const flightGanttSlice = createSlice({
  name: 'flightGantt',
  initialState,
  reducers: {
    /** Silent update from SSE stream — does NOT trigger loading state. */
    updateGanttData: (
      state,
      action: import('@reduxjs/toolkit').PayloadAction<FlightGantt>,
    ) => {
      state.data = action.payload;
      // También actualiza flightId para que resolvedGantt en el controller
      // pase la condición de igualdad y dispare el re-render del componente.
      if (action.payload.flight?.flightId) {
        state.flightId = action.payload.flight.flightId;
      }
    },
    /**
     * Optimistically patches a single task in the current gantt so the UI
     * reflects the user's action immediately while the backend processes it.
     * The next real fetch will overwrite these values with server data.
     */
    optimisticUpdateTask: (
      state,
      action: import('@reduxjs/toolkit').PayloadAction<OptimisticTaskPayload>,
    ) => {
      if (!state.data) return;
      const { instanceId, startTime, endTime } = action.payload;
      const task = state.data.tasks.find((t) => t.instanceId === instanceId);
      if (!task) return;
      // Use the task's scheduled start as the date anchor so that the optimistic
      // GanttDateTime lands on the correct calendar day (critical for cross-midnight flights).
      const refDt = task.inicioProgramado ?? task.inicioCalculado ?? null;
      if ('startTime' in action.payload) {
        task.inicioReal = startTime ? hhmmToGanttDateTime(startTime, refDt) : null;
      }
      if ('endTime' in action.payload) {
        task.finReal = endTime ? hhmmToGanttDateTime(endTime, refDt) : null;
      }

      if (task.finReal) {
        task.estado = 'COMPLETED';
      } else if (task.inicioReal) {
        task.estado = 'IN_PROGRESS';
      } else {
        task.estado = 'PENDING';
      }

      task.duracionReal = diffMinutes(task.inicioReal, task.finReal);
      task.ultimoEvento = task.finReal ?? task.inicioReal ?? task.ultimoEvento;

      // Recalculate varianzaInicio / varianzaFin / estaRetrasada so the
      // Gantt row can immediately show the red background without waiting
      // for a page reload that brings fresh server data.
      const calcStartAbsMin = task.inicioCalculado
        ? (task.inicioCalculado[3] % 24) * 60 + task.inicioCalculado[4]
        : null;
      const calcEndAbsMin = task.finCalculado
        ? (task.finCalculado[3] % 24) * 60 + task.finCalculado[4]
        : null;
      const realStartAbsMin = task.inicioReal
        ? (task.inicioReal[3] % 24) * 60 + task.inicioReal[4]
        : null;
      const realEndAbsMin = task.finReal
        ? (task.finReal[3] % 24) * 60 + task.finReal[4]
        : null;

      task.varianzaInicio =
        realStartAbsMin !== null && calcStartAbsMin !== null
          ? realStartAbsMin - calcStartAbsMin
          : null;
      task.varianzaFin =
        realEndAbsMin !== null && calcEndAbsMin !== null
          ? realEndAbsMin - calcEndAbsMin
          : null;

      const startLate =
        realStartAbsMin !== null &&
        calcStartAbsMin !== null &&
        realStartAbsMin > calcStartAbsMin + 0.5;
      const endLate =
        realEndAbsMin !== null &&
        calcEndAbsMin !== null &&
        realEndAbsMin > calcEndAbsMin + 0.5;
      task.estaRetrasada = startLate || endLate;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFlightGantt.pending, (state, action) => {
        state.loading = true;
        state.error = undefined;
        state.flightId = action.meta.arg;
      })
      .addCase(fetchFlightGantt.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        if (action.payload.flight?.flightId) {
          state.flightId = action.payload.flight.flightId;
        }
      })
      .addCase(fetchFlightGantt.rejected, (state, action) => {
        if (action.meta.aborted) {
          return;
        }
        state.loading = false;
        // Always stamp the flightId so shouldUseRequestState stays correct
        // for the next flight — otherwise it remains undefined and the loading
        // / error state is never exposed to the UI.
        state.flightId = action.meta.arg;
        if (action.error.code === 'GANTT_NOT_FOUND') {
          state.data = null;
          state.error = undefined;
          return;
        }
        state.error = action.error.message;
      });
  },
});

export const { updateGanttData, optimisticUpdateTask } =
  flightGanttSlice.actions;
export default flightGanttSlice.reducer;
