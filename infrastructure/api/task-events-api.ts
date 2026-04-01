import axios from 'axios';
import { flightsHttpPost } from '@/infrastructure/http/flights-http-methods';
import { FlightsHttpClient } from '@/infrastructure/http/flights-http-client';

export interface TaskEventResponse {
  task_instance_id: string;
  status_anterior: string;
  status_nuevo: string;
  actual_start?: string | null;
  actual_end?: string | null;
  notas?: string | null;
}

/**
 * Returns the local timezone offset string for the device running the app,
 * e.g. "-03:00" for Brazil (UTC-3), "+01:00" for Spain (UTC+1), etc.
 * This ensures timestamps are interpreted correctly regardless of country.
 */
const localOffsetStr = (): string => {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const absM = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `${sign}${absH}:${absM}`;
};

/**
 * Returns the LOCAL date part "YYYY-MM-DD" of a Date object
 * (avoids UTC conversion shifting the day).
 */
const localDatePart = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Extracts the local "YYYY-MM-DD" date part from a full ISO string
 * (e.g. "2026-03-24T16:30:00-03:00" → "2026-03-24").
 * Returns null if the string is not a recognisable ISO date.
 */
const extractDateFromIso = (iso: string): string | null => {
  // Match the date portion at the very beginning of the ISO string
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match?.[1] ?? null;
};

/**
 * Builds an ISO 8601 timestamp with local UTC offset from an "HH:mm" input.
 *
 * Accepted input formats:
 *   "HH:mm"  — standard masked input (e.g. "17:20")
 *   "HHmm"   — 4 raw digits without colon (e.g. "1720") — safety fallback
 *
 * Date resolution priority:
 *  1. Date extracted from `stdIso` (the flight's STD ISO string) — ensures
 *     tasks belonging to a flight on a different calendar day use the correct date.
 *  2. Today's local date — fallback when no flight ISO is available.
 *
 * IMPORTANT: This function always uses the caller-supplied time. It never
 * silently substitutes the current system time, so whatever the operator
 * types in the UI is exactly what gets persisted to the backend.
 */
const buildIso = (timeHhmm: string, stdIso: string | null): string => {
  const now = new Date();

  // Prefer the date from the flight's STD ISO so we don't accidentally shift
  // the day when the flight belongs to a date other than today.
  const datePart =
    (stdIso ? extractDateFromIso(stdIso) : null) ?? localDatePart(now);

  // Normalise: strip everything except digits, then re-insert the colon.
  const digits = timeHhmm.replace(/\D/g, '');
  const hh = digits.slice(0, 2).padStart(2, '0');
  const mm = digits.slice(2, 4).padStart(2, '0');

  // Only build the timestamp when we have exactly 4 meaningful digits.
  // If the input is empty / incomplete we still honour it with "00:00" so we
  // never corrupt the stored value with the current clock.
  const timePart = digits.length >= 4 ? `${hh}:${mm}:00` : `${hh}:${mm}:00`;

  return `${datePart}T${timePart}${localOffsetStr()}`;
};

/** Parse a JSON string safely — returns the original string if parsing fails */
const tryParseJson = (value: unknown): unknown => {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
};

const isValidation422 = (error: unknown): boolean => {
  return axios.isAxiosError(error) && error.response?.status === 422;
};

const log422Details = (scope: string, error: unknown): void => {
  if (!axios.isAxiosError(error)) {
    console.error(`[TaskEventsAPI] ${scope} falló`, error);
    return;
  }

  const responseData = tryParseJson(error.response?.data);
  console.error(
    `[TaskEventsAPI] ${scope} respondió 422`,
    {
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
      requestBody: tryParseJson(error.config?.data),
      responseData,
    },
  );
};

export interface UpdateTaskTimesResponse {
  success: boolean;
  instanceId: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  message?: string;
}

/**
 * Starts a task via POST /api/v1/tasks/{taskInstanceId}/start
 */
export const startTask = async (
  taskInstanceId: string,
  time: string,
  stdIso: string | null,
): Promise<TaskEventResponse> => {
  const timestamp = buildIso(time, stdIso);

  const bodySnake = {
    task_instance_id: taskInstanceId,
    actual_start: timestamp,
    started_by: 'operador',
    notas: 'Inicio manual por operador',
  };

  try {
    return await flightsHttpPost<TaskEventResponse>(
      `/api/v1/tasks/${taskInstanceId}/start`,
      bodySnake,
    );
  } catch (error) {
    if (!isValidation422(error)) {
      throw error;
    }

    log422Details('startTask (snake_case)', error);

    // Fallback 1: mismo endpoint con camelCase
    const bodyCamel = {
      taskInstanceId,
      actualStart: timestamp,
      startedBy: 'operador',
      notes: 'Inicio manual por operador',
    };

    try {
      return await flightsHttpPost<TaskEventResponse>(
        `/api/v1/tasks/${taskInstanceId}/start`,
        bodyCamel,
      );
    } catch (camelError) {
      if (!isValidation422(camelError)) {
        throw camelError;
      }

      log422Details('startTask (camelCase)', camelError);

      // Fallback 2: endpoint alternativo de turnarounds
      return flightsHttpPost<TaskEventResponse>(
        `/api/v1/turnarounds/tasks/${taskInstanceId}/start`,
        bodyCamel,
      );
    }
  }
};

/**
 * Finishes a task via POST /api/v1/tasks/{taskInstanceId}/finish
 */
export const finishTask = async (
  taskInstanceId: string,
  time: string,
  stdIso: string | null,
): Promise<TaskEventResponse> => {
  const timestamp = buildIso(time, stdIso);

  const bodySnake = {
    task_instance_id: taskInstanceId,
    actual_end: timestamp,
    finished_by: 'operador',
    notas: 'Tarea completada sin novedades',
  };

  try {
    return await flightsHttpPost<TaskEventResponse>(
      `/api/v1/tasks/${taskInstanceId}/finish`,
      bodySnake,
    );
  } catch (error) {
    if (!isValidation422(error)) {
      throw error;
    }

    log422Details('finishTask (snake_case)', error);

    // Fallback 1: mismo endpoint con camelCase
    const bodyCamel = {
      taskInstanceId,
      actualEnd: timestamp,
      finishedBy: 'operador',
      notes: 'Tarea completada sin novedades',
    };

    try {
      return await flightsHttpPost<TaskEventResponse>(
        `/api/v1/tasks/${taskInstanceId}/finish`,
        bodyCamel,
      );
    } catch (camelError) {
      if (!isValidation422(camelError)) {
        throw camelError;
      }

      log422Details('finishTask (camelCase)', camelError);

      // Fallback 2: endpoint alternativo de turnarounds
      return flightsHttpPost<TaskEventResponse>(
        `/api/v1/turnarounds/tasks/${taskInstanceId}/finish`,
        bodyCamel,
      );
    }
  }
};

/**
 * Updates start and/or end times of a task (Actualizar button).
 * PATCH /api/v1/tasks/{taskInstanceId}/times
 * Body: { actualStart, actualEnd, updatedBy }
 */
export const updateTaskTimes = async (
  taskInstanceId: string,
  startTime: string | null,
  endTime: string | null,
  stdIso: string | null,
): Promise<UpdateTaskTimesResponse> => {
  const bodyCamel: Record<string, string | null> = {
    updatedBy: 'operador',
    actualStart: startTime ? buildIso(startTime, stdIso) : null,
    actualEnd:   endTime   ? buildIso(endTime,   stdIso) : null,
  };

  try {
    const response = await FlightsHttpClient.patch<UpdateTaskTimesResponse>(
      `/api/v1/tasks/${taskInstanceId}/times`,
      bodyCamel,
    );
    return response.data;
  } catch (error) {
    if (!isValidation422(error)) {
      throw error;
    }

    log422Details('updateTaskTimes (camelCase)', error);

    const bodySnake: Record<string, string | null> = {
      updated_by: 'operador',
      actual_start: startTime ? buildIso(startTime, stdIso) : null,
      actual_end: endTime ? buildIso(endTime, stdIso) : null,
      task_instance_id: taskInstanceId,
    };

    try {
      const snakeResponse = await FlightsHttpClient.patch<UpdateTaskTimesResponse>(
        `/api/v1/tasks/${taskInstanceId}/times`,
        bodySnake,
      );
      return snakeResponse.data;
    } catch (snakeError) {
      if (!isValidation422(snakeError)) {
        throw snakeError;
      }

      log422Details('updateTaskTimes (snake_case)', snakeError);

      const turnaroundResponse = await FlightsHttpClient.patch<UpdateTaskTimesResponse>(
        `/api/v1/turnarounds/tasks/${taskInstanceId}/times`,
        bodyCamel,
      );
      return turnaroundResponse.data;
    }
  }
};

export interface UpdateTaskStatusResponse {
  task_instance_id?: string;
  status?: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  updatedBy?: string;
  message?: string;
}

/**
 * Updates the status and actual times of a task via:
 * PUT /api/v1/turnarounds/tasks/{taskInstanceId}/status
 *
 * Used when pressing "Actualizar" in the edit drawer — allows correcting
 * actualStart / actualEnd and re-setting the task status from the frontend.
 *
 * @param taskInstanceId  The full instance ID, e.g. "TATA320-RAMP-BRIEF-BTW-LA3479-2026-03-16"
 * @param status          Backend status value: "IN_PROGRESS" | "COMPLETED" | "NOT_STARTED"
 * @param startTime       "HH:mm" string from the Inicio input (may be empty/null)
 * @param endTime         "HH:mm" string from the Fin input (may be empty/null)
 * @param stdIso          Flight STD ISO string used to resolve the correct date
 */
export const updateTaskStatus = async (
  taskInstanceId: string,
  status: string,
  startTime: string | null,
  endTime: string | null,
  stdIso: string | null,
): Promise<UpdateTaskStatusResponse> => {
  const body: Record<string, string | null> = {
    status,
    actualStart: startTime ? buildIso(startTime, stdIso) : null,
    actualEnd:   endTime   ? buildIso(endTime,   stdIso) : null,
    updatedBy:   'operador1',
  };

  const response = await FlightsHttpClient.patch<UpdateTaskStatusResponse>(
    `/api/v1/turnarounds/tasks/${taskInstanceId}/status`,
    body,
  );
  return response.data;
};
