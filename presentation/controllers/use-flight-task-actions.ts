import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import type { Flight } from '@/domain/entities/flight';
import {
  canManageFlightTaskActions,
  VIEWER_TASK_ACTION_RESTRICTION_MESSAGE,
} from '@/domain/services/flight-task-permissions';
import {
  finishTask as finishTaskRequest,
  startTask as startTaskRequest,
  updateTaskTimes as updateTaskTimesRequest,
} from '@/infrastructure/api/task-events-api';
import { useAuthSelector } from '@/presentation/adapters/redux/use-auth-selector';
import type { AppDispatch } from '@/store';
import { addSessionEvent } from '@/store/slices/session-events-slice';

import type { TabletTaskStatusTone } from '../view-models/tablet-flight-detail-view-model';

/** Tiempo que el override optimista cubre datos del servidor aún no actualizados por el worker */
const LOCAL_OVERRIDE_TTL_MS = 180_000;

const SYNC_DELAY_MS = 4000;

export type FlightTaskActionTarget = {
  instanceId: string;
  title: string;
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  startTimeLabel?: string | null;
  endTimeLabel?: string | null;
};

export type FlightTaskActionResult = {
  statusTone: TabletTaskStatusTone;
  statusLabel: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
  durationLabel?: string;
};

type UseFlightTaskActionsResult = {
  startTask: (
    task: FlightTaskActionTarget,
    time: string,
  ) => Promise<FlightTaskActionResult>;
  finishTask: (
    task: FlightTaskActionTarget,
    time: string,
  ) => Promise<FlightTaskActionResult>;
  updateTask: (
    task: FlightTaskActionTarget,
    startTime: string,
    endTime: string,
  ) => Promise<FlightTaskActionResult>;
  completeHitoTask: (
    task: FlightTaskActionTarget,
    time: string,
    onlyFinish: boolean,
  ) => Promise<FlightTaskActionResult>;
  optimisticTasks: Record<string, FlightTaskActionResult>;
};

type UseFlightTaskActionsOptions = {
  flight: Flight | null;
  patchTask: (payload: {
    instanceId: string;
    startTime?: string | null;
    endTime?: string | null;
  }) => void;
  updateTaskFromApiResponse: (payload: {
    instanceId: string;
    actualStart?: string | null;
    actualEnd?: string | null;
    estado?: string;
    duracionReal?: number | null;
  }) => void;
  loadFlightGantt: (flightId: string) => unknown;
};

const normalizeSessionTimeValue = (value?: string | null): string | null => {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === '--:--' || trimmed === '----') {
    return null;
  }

  return trimmed;
};

const resolveUpdatedTimeChange = ({
  previousStartTime,
  previousEndTime,
  plannedStartTime,
  plannedEndTime,
  nextStartTime,
  nextEndTime,
}: {
  previousStartTime?: string | null;
  previousEndTime?: string | null;
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  nextStartTime?: string | null;
  nextEndTime?: string | null;
}): { previousTime: string | null; nextTime: string | null } => {
  const previousStart = normalizeSessionTimeValue(previousStartTime);
  const previousEnd = normalizeSessionTimeValue(previousEndTime);
  const plannedStart = normalizeSessionTimeValue(plannedStartTime);
  const plannedEnd = normalizeSessionTimeValue(plannedEndTime);
  const nextStart = normalizeSessionTimeValue(nextStartTime);
  const nextEnd = normalizeSessionTimeValue(nextEndTime);

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
};

const getStatusPresentation = (
  status?: string | null,
  fallback: TabletTaskStatusTone = 'pending',
): Pick<FlightTaskActionResult, 'statusTone' | 'statusLabel'> => {
  const normalized = status?.toUpperCase().trim();

  if (
    normalized === 'COMPLETED' ||
    normalized === 'COMPLETADA' ||
    fallback === 'completed'
  ) {
    return {
      statusTone: 'completed',
      statusLabel: 'Finalizado',
    };
  }

  if (
    normalized === 'IN_PROGRESS' ||
    normalized === 'EN_PROGRESO' ||
    fallback === 'in_progress'
  ) {
    return {
      statusTone: 'in_progress',
      statusLabel: 'En progreso',
    };
  }

  return {
    statusTone: 'pending',
    statusLabel: 'Pendiente',
  };
};

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

const calcDelayMinutes = (actual: string, planned?: string | null): number => {
  if (!planned || planned === '--:--') {
    return 0;
  }

  return toMinutes(actual) - toMinutes(planned);
};

const calcDurationLabel = (
  startTime?: string | null,
  endTime?: string | null,
): string | undefined => {
  if (!startTime) {
    return undefined;
  }

  if (!endTime) {
    return '0m';
  }

  return `${Math.max(0, toMinutes(endTime) - toMinutes(startTime))}m`;
};

const resolveKnownTime = (value?: string | null): string | null => {
  if (!value || value === '--:--') {
    return null;
  }

  return value;
};

const resolveTaskStartTime = (task: FlightTaskActionTarget): string | null => {
  return (
    resolveKnownTime(task.startTimeLabel) ??
    resolveKnownTime(task.plannedStartTime)
  );
};

export const useFlightTaskActions = ({
  flight,
  patchTask,
  updateTaskFromApiResponse,
  loadFlightGantt,
}: UseFlightTaskActionsOptions): UseFlightTaskActionsResult => {
  const dispatch = useDispatch<AppDispatch>();
  const { role } = useAuthSelector();
  const canManageTaskActions = canManageFlightTaskActions(role);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearOverrideTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const [optimisticTasks, setOptimisticTasks] = useState<
    Record<string, FlightTaskActionResult>
  >({});

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      Object.values(clearOverrideTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    setOptimisticTasks({});
    Object.values(clearOverrideTimeoutsRef.current).forEach(clearTimeout);
    clearOverrideTimeoutsRef.current = {};
  }, [flight?.flightId]);

  const clearOptimisticTask = useCallback((instanceId: string) => {
    setOptimisticTasks((current) => {
      if (!current[instanceId]) {
        return current;
      }

      const next = { ...current };
      delete next[instanceId];
      return next;
    });

    const timeoutId = clearOverrideTimeoutsRef.current[instanceId];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete clearOverrideTimeoutsRef.current[instanceId];
    }
  }, []);

  const setOptimisticTask = useCallback(
    (instanceId: string, result: FlightTaskActionResult) => {
      setOptimisticTasks((current) => ({
        ...current,
        [instanceId]: result,
      }));
    },
    [],
  );

  const keepOptimisticTask = useCallback(
    (instanceId: string) => {
      const previousTimeout = clearOverrideTimeoutsRef.current[instanceId];
      if (previousTimeout) {
        clearTimeout(previousTimeout);
      }

      clearOverrideTimeoutsRef.current[instanceId] = setTimeout(() => {
        clearOptimisticTask(instanceId);
      }, LOCAL_OVERRIDE_TTL_MS);
    },
    [clearOptimisticTask],
  );

  const scheduleSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    if (!flight?.flightId) {
      return;
    }
    syncTimeoutRef.current = setTimeout(() => {
      void loadFlightGantt(flight.flightId);
      syncTimeoutRef.current = null;
    }, SYNC_DELAY_MS);
  }, [flight?.flightId, loadFlightGantt]);

  const reloadNow = useCallback(() => {
    if (!flight?.flightId) {
      return;
    }
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    void loadFlightGantt(flight.flightId);
  }, [flight?.flightId, loadFlightGantt]);

  const registerSessionEvent = useCallback(
    (
      type: 'started' | 'finished' | 'updated',
      task: FlightTaskActionTarget,
      time: string,
      delayMinutes: number,
      metadata?: {
        previousTime?: string | null;
        nextTime?: string | null;
      },
    ) => {
      dispatch(
        addSessionEvent({
          type,
          taskInstanceId: task.instanceId,
          taskName: task.title,
          time,
          previousTime: metadata?.previousTime ?? null,
          nextTime: metadata?.nextTime ?? null,
          timestamp: Date.now(),
          flightId: flight?.flightId ?? '',
          isDelayed: delayMinutes > 0,
          delayMinutes: Math.abs(delayMinutes),
        }),
      );
    },
      [dispatch, flight?.flightId],
  );

  const startTask = useCallback(
    async (
      task: FlightTaskActionTarget,
      time: string,
    ): Promise<FlightTaskActionResult> => {
      if (!canManageTaskActions) {
        throw new Error(VIEWER_TASK_ACTION_RESTRICTION_MESSAGE);
      }

      const optimisticResult: FlightTaskActionResult = {
        statusTone: 'in_progress',
        statusLabel: 'En progreso',
        startTimeLabel: time,
        durationLabel: '0m',
      };

      setOptimisticTask(task.instanceId, optimisticResult);
      patchTask({ instanceId: task.instanceId, startTime: time });

      try {
        const response = await startTaskRequest(
          task.instanceId,
          time,
          flight?.std ?? null,
        );
        const delayMinutes = calcDelayMinutes(time, task.plannedStartTime);
        registerSessionEvent('started', task, time, delayMinutes);
        
        // Update task with API response data
        updateTaskFromApiResponse({
          instanceId: task.instanceId,
          actualStart: response.actual_start ?? null,
          estado: response.status_nuevo ?? 'IN_PROGRESS',
        });
        
        scheduleSync();

        const result = {
          ...getStatusPresentation(response.status_nuevo, 'in_progress'),
          startTimeLabel: time,
          durationLabel: '0m',
        };
        setOptimisticTask(task.instanceId, result);
        keepOptimisticTask(task.instanceId);

        return result;
      } catch (error) {
        clearOptimisticTask(task.instanceId);
        reloadNow();
        throw error instanceof Error
          ? error
          : new Error('No se pudo iniciar la tarea. Intenta de nuevo.');
      }
    },
    [
      canManageTaskActions,
      clearOptimisticTask,
      flight?.std,
      keepOptimisticTask,
      patchTask,
      updateTaskFromApiResponse,
      registerSessionEvent,
      reloadNow,
      scheduleSync,
      setOptimisticTask,
    ],
  );

  const finishTask = useCallback(
    async (
      task: FlightTaskActionTarget,
      time: string,
    ): Promise<FlightTaskActionResult> => {
      if (!canManageTaskActions) {
        throw new Error(VIEWER_TASK_ACTION_RESTRICTION_MESSAGE);
      }

      const optimisticResult: FlightTaskActionResult = {
        statusTone: 'completed',
        statusLabel: 'Finalizado',
        endTimeLabel: time,
        durationLabel: calcDurationLabel(resolveTaskStartTime(task), time),
      };

      setOptimisticTask(task.instanceId, optimisticResult);
      patchTask({ instanceId: task.instanceId, endTime: time });

      try {
        const response = await finishTaskRequest(
          task.instanceId,
          time,
          flight?.std ?? null,
        );
        const delayMinutes = calcDelayMinutes(time, task.plannedEndTime);
        registerSessionEvent('finished', task, time, delayMinutes);
        
        // Update task with API response data
        updateTaskFromApiResponse({
          instanceId: task.instanceId,
          actualEnd: response.actual_end ?? null,
          estado: response.status_nuevo ?? 'COMPLETED',
        });
        
        scheduleSync();

        const result = {
          ...getStatusPresentation(response.status_nuevo, 'completed'),
          endTimeLabel: time,
          durationLabel: calcDurationLabel(resolveTaskStartTime(task), time),
        };
        setOptimisticTask(task.instanceId, result);
        keepOptimisticTask(task.instanceId);

        return result;
      } catch (error) {
        clearOptimisticTask(task.instanceId);
        reloadNow();
        throw error instanceof Error
          ? error
          : new Error('No se pudo finalizar la tarea. Intenta de nuevo.');
      }
    },
    [
      canManageTaskActions,
      clearOptimisticTask,
      flight?.std,
      keepOptimisticTask,
      patchTask,
      updateTaskFromApiResponse,
      registerSessionEvent,
      reloadNow,
      scheduleSync,
      setOptimisticTask,
    ],
  );

  const updateTask = useCallback(
    async (
      task: FlightTaskActionTarget,
      startTime: string,
      endTime: string,
    ): Promise<FlightTaskActionResult> => {
      if (!canManageTaskActions) {
        throw new Error(VIEWER_TASK_ACTION_RESTRICTION_MESSAGE);
      }

      const fallbackTone: TabletTaskStatusTone = endTime
        ? 'completed'
        : startTime
          ? 'in_progress'
          : 'pending';
      const optimisticResult: FlightTaskActionResult = {
        ...getStatusPresentation(undefined, fallbackTone),
        startTimeLabel: startTime || '--:--',
        endTimeLabel: endTime || '--:--',
        durationLabel:
          calcDurationLabel(startTime || null, endTime || null) ?? '--:--',
      };

      setOptimisticTask(task.instanceId, optimisticResult);
      patchTask({
        instanceId: task.instanceId,
        startTime: startTime || null,
        endTime: endTime || null,
      });

      try {
        const response = await updateTaskTimesRequest(
          task.instanceId,
          startTime || null,
          endTime || null,
          flight?.std ?? null,
        );

        // Update task with API response data
        updateTaskFromApiResponse({
          instanceId: task.instanceId,
          actualStart: startTime && response.actual_start ? response.actual_start : null,
          actualEnd: endTime && response.actual_end ? response.actual_end : null,
          estado: response.status_nuevo ?? undefined,
          duracionReal: response.duracion_real ?? null,
        });

        const delayStart = startTime
          ? calcDelayMinutes(startTime, task.plannedStartTime)
          : 0;
        const delayEnd = endTime
          ? calcDelayMinutes(endTime, task.plannedEndTime)
          : 0;

        const updatedTimes = resolveUpdatedTimeChange({
          previousStartTime: task.startTimeLabel,
          previousEndTime: task.endTimeLabel,
          plannedStartTime: task.plannedStartTime,
          plannedEndTime: task.plannedEndTime,
          nextStartTime: startTime,
          nextEndTime: endTime,
        });

        registerSessionEvent(
          'updated',
          task,
          updatedTimes.nextTime ?? startTime ?? endTime ?? '',
          Math.max(delayStart, delayEnd),
          updatedTimes,
        );
        scheduleSync();
        setOptimisticTask(task.instanceId, optimisticResult);
        keepOptimisticTask(task.instanceId);

        return optimisticResult;
      } catch (error) {
        clearOptimisticTask(task.instanceId);
        reloadNow();
        throw error instanceof Error
          ? error
          : new Error('No se pudo actualizar la tarea. Intenta de nuevo.');
      }
    },
    [
      canManageTaskActions,
      clearOptimisticTask,
      flight?.std,
      keepOptimisticTask,
      patchTask,
      updateTaskFromApiResponse,
      registerSessionEvent,
      reloadNow,
      scheduleSync,
      setOptimisticTask,
    ],
  );

  /**
   * HITO "Marcar Marco": un solo PATCH de tiempos (inicio = fin = hora del marco) evita la
   * condición de carrera de dos POST /start y /finish seguidos en mobile/tablet, que podían
   * pisarse en el backend. Si el hito ya tenía inicio real, solo se llama /finish.
   * Tras el PATCH se fuerza `reloadNow()` para alinear Gantt con la API (además del scheduleSync interno de updateTask).
   */
  const completeHitoTask = useCallback(
    async (
      task: FlightTaskActionTarget,
      time: string,
      onlyFinish: boolean,
    ): Promise<FlightTaskActionResult> => {
      if (onlyFinish) {
        return finishTask(task, time);
      }
      const result = await updateTask(task, time, time);
      reloadNow();
      return result;
    },
    [finishTask, reloadNow, updateTask],
  );

  return {
    startTask,
    finishTask,
    updateTask,
    completeHitoTask,
    optimisticTasks,
  };
};
