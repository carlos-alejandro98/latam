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
 * Date resolution strategy (proximity-based):
 *  Given a reference ISO string (the task's planned time or the flight STD),
 *  we generate three candidate dates: reference-day-1, reference-day, reference-day+1.
 *  We pick the candidate whose resulting timestamp is closest to the reference
 *  timestamp.  This correctly handles overnight flights where arrival tasks sit
 *  on day N and departure tasks on day N+1.
 *
 *  Fallback: today's local date when no reference is available.
 *
 * IMPORTANT: This function always uses the caller-supplied time. It never
 * silently substitutes the current system time.
 */
const buildIso = (
  timeHhmm: string,
  /** Reference ISO — can be the task's scheduledStart ISO or the flight's STD */
  refIso: string | null,
): string => {
  const now = new Date();

  // Normalise input: strip non-digits, extract HH and mm.
  const digits = timeHhmm.replace(/\D/g, '');
  let hh = Number(digits.slice(0, 2)) || 0;
  let mm = Number(digits.slice(2, 4)) || 0;
  
  // Validate and normalize hours/minutes
  // If hours >= 24, roll over to next day
  let dayOffset = 0;
  if (hh >= 24) {
    dayOffset = Math.floor(hh / 24);
    hh = hh % 24;
  }
  if (mm >= 60) {
    hh += Math.floor(mm / 60);
    mm = mm % 60;
    if (hh >= 24) {
      dayOffset += Math.floor(hh / 24);
      hh = hh % 24;
    }
  }
  
  const timePart = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;

  // Parse reference date.  Accept full ISO strings ("2026-04-01T23:32:00-03:00")
  // or bare date strings ("2026-04-01").
  const refDateStr = refIso ? extractDateFromIso(refIso) : null;
  const refDate = refDateStr
    ? new Date(`${refDateStr}T00:00:00`)
    : now;

  // Build three candidate Date objects centered on the reference day,
  // plus an additional candidate if we have a dayOffset from hour rollover.
  const candidates: Date[] = [-1, 0, 1].map((offset) => {
    const d = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + offset + dayOffset, hh, mm, 0, 0);
    return d;
  });

  // Reference timestamp for proximity comparison: refDate at HH:mm.
  const refTs =
    new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), hh, mm, 0, 0).getTime();

  // Pick the candidate whose timestamp is closest to refTs.
  const best = candidates.reduce<Date>((prev, curr) =>
    Math.abs(curr.getTime() - refTs) < Math.abs(prev.getTime() - refTs)
      ? curr
      : prev,
  );

  const datePart = localDatePart(best);
  return `${datePart}T${timePart}${localOffsetStr()}`;
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
