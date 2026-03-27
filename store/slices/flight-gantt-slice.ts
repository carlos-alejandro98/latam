import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { container } from '@/dependencyInjection/container';
import type { FlightGantt } from '@/domain/entities/flight-gantt';

export const fetchFlightGantt = createAsyncThunk(
  'flightGantt/fetchByFlightId',
  async (flightId: string) => {
    console.log('[GanttSlice] fetchFlightGantt — START | flightId:', flightId);
    const result = await container.getFlightGanttUseCase.execute(flightId);
    console.log('[GanttSlice] fetchFlightGantt — SUCCESS | flightId:', flightId, '| tasks:', result?.tasks?.length ?? 0, '| turnaroundId:', result?.turnaroundId);
    return result;
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

/** Converts "HH:mm" into a GanttDateTime tuple [year,month,day,hour,minute] using today's date. */
const hhmmToGanttDateTime = (hhmm: string): FlightGantt['tasks'][0]['inicioReal'] => {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate(), h, m] as unknown as FlightGantt['tasks'][0]['inicioReal'];
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
  const startDate = new Date(startYear, startMonth - 1, startDay, startHour, startMinute);
  const endDate = new Date(endYear, endMonth - 1, endDay, endHour, endMinute);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
};

const flightGanttSlice = createSlice({
  name: 'flightGantt',
  initialState,
  reducers: {
    /** Silent update from SSE stream — does NOT trigger loading state. */
    updateGanttData: (state, action: import('@reduxjs/toolkit').PayloadAction<FlightGantt>) => {
      console.log('[GanttSlice] updateGanttData (SSE) | tasks:', action.payload?.tasks?.length ?? 0);
      state.data = action.payload;
    },
    /**
     * Optimistically patches a single task in the current gantt so the UI
     * reflects the user's action immediately while the backend processes it.
     * The next real fetch will overwrite these values with server data.
     */
    optimisticUpdateTask: (state, action: import('@reduxjs/toolkit').PayloadAction<OptimisticTaskPayload>) => {
      if (!state.data) return;
      const { instanceId, startTime, endTime } = action.payload;
      console.log('[GanttSlice] optimisticUpdateTask | instanceId:', instanceId, '| startTime:', startTime, '| endTime:', endTime);
      const task = state.data.tasks.find((t) => t.instanceId === instanceId);
      if (!task) {
        console.warn('[GanttSlice] optimisticUpdateTask — task NOT FOUND in gantt | instanceId:', instanceId, '| total tasks:', state.data.tasks.length);
        return;
      }
      console.log('[GanttSlice] optimisticUpdateTask — BEFORE patch | taskId:', task.taskId, '| estado:', task.estado, '| inicioReal:', task.inicioReal, '| finReal:', task.finReal);
      if ('startTime' in action.payload) {
        task.inicioReal = startTime ? hhmmToGanttDateTime(startTime) : null;
      }
      if ('endTime' in action.payload) {
        task.finReal = endTime ? hhmmToGanttDateTime(endTime) : null;
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
      console.log('[GanttSlice] optimisticUpdateTask — AFTER patch | taskId:', task.taskId, '| estado:', task.estado, '| inicioReal:', task.inicioReal, '| finReal:', task.finReal, '| duracionReal:', task.duracionReal);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFlightGantt.pending, (state, action) => {
        console.log('[GanttSlice] fetchFlightGantt PENDING | flightId:', action.meta.arg);
        state.loading = true;
        state.error = undefined;
        state.flightId = action.meta.arg;
      })
      .addCase(fetchFlightGantt.fulfilled, (state, action) => {
        console.log('[GanttSlice] fetchFlightGantt FULFILLED | tasks loaded:', action.payload?.tasks?.length ?? 0, '| flightId:', action.meta.arg);
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchFlightGantt.rejected, (state, action) => {
        console.warn('[GanttSlice] fetchFlightGantt REJECTED | flightId:', action.meta.arg, '| code:', action.error.code, '| message:', action.error.message);
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

export const { updateGanttData, optimisticUpdateTask } = flightGanttSlice.actions;
export default flightGanttSlice.reducer;
