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
 * Builds a timestamp string from an "HH:mm" input exactly as typed by the
 * operator, with NO timezone offset appended.
 *
 * The backend treats the value as a local time and must not receive any UTC
 * offset — adding "-03:00" caused the server to shift the stored time by
 * 3 hours, which is the bug being fixed here.
 *
 * Date resolution priority:
 *  1. Date extracted from `stdIso` — ensures tasks on a different calendar
 *     day from today use the correct date.
 *  2. Today's local date — fallback when no flight ISO is available.
 */
const buildIso = (timeHhmm: string, stdIso: string | null): string => {
  const now = new Date();

  const datePart =
    (stdIso ? extractDateFromIso(stdIso) : null) ?? localDatePart(now);

  // Normalise: strip non-digits, re-insert colon.
  const digits = timeHhmm.replace(/\D/g, '');
  const hh = digits.slice(0, 2).padStart(2, '0');
  const mm = digits.slice(2, 4).padStart(2, '0');

  // Return plain local datetime — no UTC offset — so the backend stores
  // exactly the time the operator entered.
  return `${datePart}T${hh}:${mm}:00`;
};

/** Parse a JSON string safely — returns the original string if parsing fails */
const tryParseJson = (value: unknown): unknown => {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
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
  const body = {
    task_instance_id: taskInstanceId,
    actual_start: timestamp,
    started_by: 'operador',
    notas: 'Inicio manual por operador',
  };
  const result = await flightsHttpPost<TaskEventResponse>(
    `/api/v1/tasks/${taskInstanceId}/start`,
    body,
  );
  return result;
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
  const body = {
    task_instance_id: taskInstanceId,
    actual_end: timestamp,
    finished_by: 'operador',
    notas: 'Tarea completada sin novedades',
  };
  const result = await flightsHttpPost<TaskEventResponse>(
    `/api/v1/tasks/${taskInstanceId}/finish`,
    body,
  );
  return result;
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
  const body: Record<string, string | null> = {
    updatedBy: 'operador',
    actualStart: startTime ? buildIso(startTime, stdIso) : null,
    actualEnd:   endTime   ? buildIso(endTime,   stdIso) : null,
  };
  const response = await FlightsHttpClient.patch<UpdateTaskTimesResponse>(
    `/api/v1/tasks/${taskInstanceId}/times`,
    body,
  );
  return response.data;
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
