import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { container } from '@/dependencyInjection/container';
import type { FlightGantt } from '@/domain/entities/flight-gantt';

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
 * The date is derived from the task's planned/calculated dates so that times
 * which cross midnight (e.g. arrival 23:xx → departure 02:xx next day) land
 * on the correct calendar day.  Fallback is today's local date.
 *
 * Strategy:
 * 1. Extract a reference date from the task (programado or calculado).
 * 2. Build candidate dates: reference-day-1, reference-day, reference-day+1.
 * 3. Pick the candidate whose HH:mm is closest to the reference time.
 */
const hhmmToGanttDateTime = (
  hhmm: string,
  task?: FlightGantt['tasks'][0],
): FlightGantt['tasks'][0]['inicioReal'] => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate(), h, m] as unknown as FlightGantt['tasks'][0]['inicioReal'];
  }

  // Try to find a reference date from the task's programado/calculado fields.
  const refTuple =
    task?.inicioProgramado ??
    task?.finProgramado ??
    task?.inicioCalculado ??
    task?.finCalculado ??
    task?.inicioReal ??
    task?.finReal;

  const refDate =
    refTuple && refTuple.length >= 3
      ? new Date(refTuple[0], refTuple[1] - 1, refTuple[2])
      : new Date();

  // Build three candidate dates centered on the reference day
  const candidates: Date[] = [-1, 0, 1].map((offset) => {
    const d = new Date(refDate);
    d.setDate(d.getDate() + offset);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  });

  // Reference timestamp for proximity comparison
  const refTs = refDate.getTime() + (h * 60 + m) * 60000;

  // Pick the candidate closest in absolute time to the reference
  const best = candidates.reduce<Date>((prev, curr) =>
    Math.abs(curr.getTime() - refTs) < Math.abs(prev.getTime() - refTs)
      ? curr
      : prev,
  );

  return [
    best.getFullYear(),
    best.getMonth() + 1,
    best.getDate(),
    h,
    m,
  ] as unknown as FlightGantt['tasks'][0]['inicioReal'];
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
      if ('startTime' in action.payload) {
        task.inicioReal = startTime ? hhmmToGanttDateTime(startTime, task) : null;
      }
      if ('endTime' in action.payload) {
        task.finReal = endTime ? hhmmToGanttDateTime(endTime, task) : null;
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
      })
      .addCase(fetchFlightGantt.rejected, (state, action) => {
        if (action.meta.aborted) {
          return;
        }
        state.loading = false;
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
