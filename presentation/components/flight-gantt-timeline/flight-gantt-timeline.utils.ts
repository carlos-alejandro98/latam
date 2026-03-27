import type { FlightGanttTask } from "@/domain/entities/flight-gantt";

import type {
  TimelineBarRange,
  TimelineDomain,
  TimelineMarker,
  TimelineTaskRowData,
} from "./flight-gantt-timeline.types";

const DAY_START_MINUTE = 0;
const DAY_END_MINUTE = 1440;
const MIN_BAR_DURATION_MINUTES = 0.5;
const TIMELINE_MIN_WIDTH = 920;
const PIXELS_PER_MINUTE = 9;
const FIXED_TICK_STEP_MINUTES = 5;

export interface TimelineZoomLevel {
  id: string;
  percentage: number;
  pixelsPerMinute: number;
  tickStepMinutes: number;
}

export const TIMELINE_ZOOM_LEVELS: TimelineZoomLevel[] = [
  {
    id: "50",
    percentage: 50,
    pixelsPerMinute: 4.5,
    tickStepMinutes: 15,
  },
  {
    id: "75",
    percentage: 75,
    pixelsPerMinute: 6.5,
    tickStepMinutes: 10,
  },
  {
    id: "100",
    percentage: 100,
    pixelsPerMinute: 9,
    tickStepMinutes: 5,
  },
  {
    id: "125",
    percentage: 125,
    pixelsPerMinute: 11.5,
    tickStepMinutes: 5,
  },
  {
    id: "150",
    percentage: 150,
    pixelsPerMinute: 14,
    tickStepMinutes: 2,
  },
];
export const DEFAULT_TIMELINE_ZOOM_LEVEL: TimelineZoomLevel =
  TIMELINE_ZOOM_LEVELS[2];

const formatMinutesAsClock = (minutesValue: number): string => {
  const absoluteMinutes = Math.abs(Math.round(minutesValue));
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/**
 * Format a GanttDateTime [year, month, day, hour, minute] as "HH:mm".
 * Returns null if the value is null or invalid.
 */
export const formatGanttDateTime = (
  dt: import('@/domain/entities/flight-gantt').GanttDateTime,
): string | null => {
  if (!dt || dt.length < 5) return null;
  const h = dt[3];
  const m = dt[4];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  // Normalize 24:00 → 00:00
  const normalizedH = h % 24;
  return `${String(normalizedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Format absolute day minutes (0–1440) as HH:mm clock string.
 */
export const formatAbsoluteMinute = (absoluteMinute: number): string => {
  const wrapped = ((Math.round(absoluteMinute) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/**
 * Convert a relative minute (relative to STD) to an absolute minute of the day.
 * Returns null if STD cannot be parsed.
 */
export const relativeToAbsoluteMinute = (
  relativeMinute: number,
  stdDate?: string | null,
  stdTime?: string | null,
): number | null => {
  if (!stdDate || !stdTime) {
    return null;
  }
  const parsedDate = parseDateValue(stdDate);
  const parsedTime = parseTimeValue(stdTime);
  if (!parsedDate || !parsedTime) {
    return null;
  }
  const stdAbsoluteMinute = parsedTime.hours * 60 + parsedTime.minutes;
  // Wrap to keep within 0–1440
  return ((stdAbsoluteMinute + relativeMinute) % 1440 + 1440) % 1440;
};

const parseDateValue = (
  dateValue: string,
): { day: number; month: number; year: number } | null => {
  if (dateValue.includes("/")) {
    const parts = dateValue.split("/");
    if (parts.length !== 3) {
      return null;
    }

    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    if (!day || !month || !year) {
      return null;
    }

    return { day, month, year };
  }

  if (dateValue.includes("-")) {
    const parts = dateValue.split("-");
    if (parts.length !== 3) {
      return null;
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!day || !month || !year) {
      return null;
    }

    return { day, month, year };
  }

  return null;
};

const parseTimeValue = (
  timeValue: string,
): { hours: number; minutes: number } | null => {
  const normalizedTime =
    timeValue.includes('T') && timeValue.length >= 16
      ? timeValue.slice(11, 16)
      : timeValue;
  const values = normalizedTime.split(":");
  if (values.length < 2) {
    return null;
  }

  const hours = Number(values[0]);
  const minutes = Number(values[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return { hours, minutes };
};

const clampBarRange = (
  startMinute: number,
  endMinute: number,
): TimelineBarRange => {
  const safeStart = Math.min(startMinute, endMinute);
  const safeEnd = Math.max(startMinute, endMinute);
  const duration = safeEnd - safeStart;
  if (duration >= MIN_BAR_DURATION_MINUTES) {
    return {
      endMinute: safeEnd,
      startMinute: safeStart,
    };
  }

  return {
    endMinute: safeStart + MIN_BAR_DURATION_MINUTES,
    startMinute: safeStart,
  };
};

/**
 * Derive the calculated bar range from inicioCalculado / finCalculado GanttDateTime fields.
 * These come directly from the backend as absolute clock times, so we convert them to
 * absolute day minutes (0–1440) here. The caller then converts to relative-to-STD via toAbsoluteRange.
 * Falls back to tiempoRelativoInicio + duration if the datetime fields are missing.
 */
const getCalculatedRange = (task: FlightGanttTask): TimelineBarRange | null => {
  const calcStart = ganttDateTimeToAbsoluteMinute(task.inicioCalculado);
  const calcEnd   = ganttDateTimeToAbsoluteMinute(task.finCalculado);

  if (calcStart !== null && calcEnd !== null) {
    // These are already absolute minutes — return as-is so toAbsoluteRange
    // does NOT add stdAbsoluteMinute again. We signal this via the wrapper below.
    return clampBarRange(calcStart, calcEnd);
  }

  // Fallback: use relative minutes stored on the task
  const startMinute = task.tiempoRelativoInicio;
  const duration = Math.max(task.baseDurationMin, task.duracionPlanificada, MIN_BAR_DURATION_MINUTES);
  const endMinute = task.tiempoRelativoFin !== null ? task.tiempoRelativoFin : startMinute + duration;
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) return null;
  return clampBarRange(startMinute, endMinute);
};

/** Convert a GanttDateTime [y, m, d, h, min] to absolute day minutes (0–1439).
 *  Normalizes h=24 to h=0 so midnight is always treated as 00:00. */
const ganttDateTimeToAbsoluteMinute = (dt: import('@/domain/entities/flight-gantt').GanttDateTime): number | null => {
  if (!dt || dt.length < 5) return null;
  const h = dt[3];
  const m = dt[4];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return ((h % 24) * 60 + m);
};

const getRealStartMinute = (
  task: FlightGanttTask,
  calculatedRange: TimelineBarRange,
): number | null => {
  // Prefer inicioReal from backend (absolute time)
  const fromInicioReal = ganttDateTimeToAbsoluteMinute(task.inicioReal);
  if (fromInicioReal !== null) return fromInicioReal;

  if (task.varianzaInicio !== null) {
    return calculatedRange.startMinute + task.varianzaInicio;
  }

  if (task.varianzaFin !== null && task.duracionReal !== null) {
    return calculatedRange.endMinute + task.varianzaFin - task.duracionReal;
  }

  if (task.duracionReal !== null) {
    return calculatedRange.startMinute;
  }

  return null;
};

const getRealEndMinute = (
  task: FlightGanttTask,
  calculatedRange: TimelineBarRange,
  realStartMinute: number | null,
): number | null => {
  // Prefer finReal from backend (absolute time)
  const fromFinReal = ganttDateTimeToAbsoluteMinute(task.finReal);
  if (fromFinReal !== null) return fromFinReal;

  if (task.varianzaFin !== null) {
    return calculatedRange.endMinute + task.varianzaFin;
  }

  if (realStartMinute !== null && task.duracionReal !== null) {
    return realStartMinute + task.duracionReal;
  }

  return null;
};

/**
 * Build a real bar range in absolute day minutes (0–1440).
 * Renders when inicioReal is set. If finReal is absent (in-progress), the bar
 * extends to "now" so the user sees the elapsed real time on the gantt.
 * stdAbsoluteMinute is unused here (GanttDateTime is already absolute) but kept for API compat.
 */
const getRealRange = (
  task: FlightGanttTask,
  _calculatedRange: TimelineBarRange | null,
  _stdAbsoluteMinute: number,
  nowTimestamp: number,
): TimelineBarRange | null => {
  const inicioAbs = ganttDateTimeToAbsoluteMinute(task.inicioReal);
  if (inicioAbs === null) return null;

  let finAbs = ganttDateTimeToAbsoluteMinute(task.finReal);
  if (finAbs === null) {
    // In-progress: extend bar to the current wall-clock minute
    const now = new Date(nowTimestamp);
    finAbs = now.getHours() * 60 + now.getMinutes();
    // If the bar hasn't grown at all yet, show a 1-minute minimum stub
    if (finAbs <= inicioAbs) finAbs = inicioAbs + 1;
  }

  return clampBarRange(inicioAbs, finAbs);
};

const getDomainBoundaries = (rows: TimelineTaskRowData[]): TimelineDomain => {
  let minMinute = Number.POSITIVE_INFINITY;
  let maxMinute = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.calculatedRange) {
      minMinute = Math.min(minMinute, row.calculatedRange.startMinute);
      maxMinute = Math.max(maxMinute, row.calculatedRange.endMinute);
    }
    if (row.realRange) {
      minMinute = Math.min(minMinute, row.realRange.startMinute);
      maxMinute = Math.max(maxMinute, row.realRange.endMinute);
    }
  }

  return { maxMinute, minMinute };
};

const applyTimelineMarkers = (
  boundaries: TimelineDomain,
  markers: TimelineMarker[],
): TimelineDomain => {
  let minMinute = boundaries.minMinute;
  let maxMinute = boundaries.maxMinute;
  for (const marker of markers) {
    minMinute = Math.min(minMinute, marker.minute);
    maxMinute = Math.max(maxMinute, marker.minute);
  }

  return { maxMinute, minMinute };
};

/**
 * Convert a relative bar range to absolute day minutes using STD as the anchor.
 */
const toAbsoluteRange = (
  range: TimelineBarRange | null,
  stdAbsoluteMinute: number,
): TimelineBarRange | null => {
  if (!range) return null;
  const startAbs = ((stdAbsoluteMinute + range.startMinute) % 1440 + 1440) % 1440;
  const endAbs = ((stdAbsoluteMinute + range.endMinute) % 1440 + 1440) % 1440;
  // If the bar crosses midnight, clamp end to 1440
  const safeEnd = endAbs < startAbs ? startAbs + (range.endMinute - range.startMinute) : endAbs;
  return { startMinute: startAbs, endMinute: Math.min(safeEnd, DAY_END_MINUTE) };
};

/**
 * Build presentation rows from backend gantt tasks, converting relative minutes
 * to absolute day minutes (0–1440) using the given STD time.
 */
/** Returns true when inicioCalculado is a valid GanttDateTime — meaning bar positions
 *  are already in absolute day minutes and must NOT have stdAbsoluteMinute added again. */
const taskHasAbsoluteCalculated = (task: FlightGanttTask): boolean =>
  ganttDateTimeToAbsoluteMinute(task.inicioCalculado) !== null &&
  ganttDateTimeToAbsoluteMinute(task.finCalculado) !== null;

export const buildTimelineRows = (
  tasks: FlightGanttTask[],
  stdDate?: string | null,
  stdTime?: string | null,
  nowTimestamp: number = Date.now(),
): TimelineTaskRowData[] => {
  const parsedDate = stdDate ? parseDateValue(stdDate) : null;
  const parsedTime = stdTime ? parseTimeValue(stdTime) : null;
  const stdAbsoluteMinute =
    parsedDate && parsedTime ? parsedTime.hours * 60 + parsedTime.minutes : 0;

  const rows: TimelineTaskRowData[] = [];
  for (const task of tasks) {
    const hasAbsolute = taskHasAbsoluteCalculated(task);
    const rawCalculatedRange = getCalculatedRange(task);

    // When inicioCalculado/finCalculado are GanttDateTime (absolute), skip the STD offset.
    const calculatedRange = hasAbsolute
      ? rawCalculatedRange
      : toAbsoluteRange(rawCalculatedRange, stdAbsoluteMinute);

    // Real range is always built from absolute GanttDateTime fields.
    const realRange = getRealRange(
      task,
      rawCalculatedRange,
      stdAbsoluteMinute,
      nowTimestamp,
    );

    rows.push({
      calculatedRange,
      estado: task.estado,
      isDelayed: task.estaRetrasada,
      realRange,
      task,
    });
  }

  return rows;
};

/**
 * Create timeline markers using absolute day minutes (0–1440).
 * stdAbsoluteMinute is the STD time expressed as minutes from 00:00.
 */
export const buildTimelineMarkers = (
  tatVueloMinutos?: number | null,
  currentRelativeMinute?: number | null,
  currentMarkerLabel?: string,
  stdAbsoluteMinute: number = 0,
): TimelineMarker[] => {
  const stdMinute = ((stdAbsoluteMinute % 1440) + 1440) % 1440;
  const markers: TimelineMarker[] = [
    {
      color: "#c2005b",
      id: "std",
      label: "STD",
      labelVariant: "outlined",
      lineStyle: "dashed",
      minute: stdMinute,
    },
  ];
  if (tatVueloMinutos && tatVueloMinutos > 0) {
    const pushInMinute = ((stdMinute - tatVueloMinutos) % 1440 + 1440) % 1440;
    markers.push({
      color: "#d61b5b",
      id: "push-in",
      label: "PUSH-IN",
      labelBackgroundColor: "#d61b5b",
      labelTextColor: "#ffffff",
      labelVariant: "filled",
      lineStyle: "dashed",
      minute: pushInMinute,
    });
  }
  if (currentRelativeMinute !== null && currentRelativeMinute !== undefined) {
    const currentMinute = ((stdMinute + currentRelativeMinute) % 1440 + 1440) % 1440;
    markers.push({
      color: "#2836c9",
      id: "current",
      label: currentMarkerLabel ?? "NOW",
      labelBackgroundColor: "#2836c9",
      labelTextColor: "#ffffff",
      labelVariant: "filled",
      lineStyle: "solid",
      minute: currentMinute,
    });
  }

  return markers;
};

export const buildTimelineDomain = (
  staTime?: string | null,
  stdTime?: string | null,
  etdTime?: string | null,
  pushOutTime?: string | null,
): TimelineDomain => {
  const parsedSta = staTime ? parseTimeValue(staTime) : null;
  const parsedStd = stdTime ? parseTimeValue(stdTime) : null;
  const parsedEtd = etdTime ? parseTimeValue(etdTime) : null;
  const parsedPushOut = pushOutTime ? parseTimeValue(pushOutTime) : null;

  const minMinute = parsedSta
    ? Math.max(
        DAY_START_MINUTE,
        parsedSta.hours * 60 + parsedSta.minutes - 120,
      )
    : DAY_START_MINUTE;

  const endSource = parsedPushOut ?? parsedEtd ?? parsedStd;
  const maxMinute = endSource
    ? Math.min(DAY_END_MINUTE, endSource.hours * 60 + endSource.minutes + 120)
    : DAY_END_MINUTE;

  if (maxMinute <= minMinute) {
    return {
      minMinute,
      maxMinute: Math.min(DAY_END_MINUTE, minMinute + 240),
    };
  }

  return {
    minMinute,
    maxMinute,
  };
};

/**
 * Generate x-axis ticks in relative minutes based on visible range.
 */
export const buildTimelineTicks = (
  domain: TimelineDomain,
  tickStepMinutes: number = FIXED_TICK_STEP_MINUTES,
): number[] => {
  const ticks: number[] = [];
  const tickStep = Math.max(1, Math.floor(tickStepMinutes));
  const initialTick = Math.floor(domain.minMinute / tickStep) * tickStep;
  for (
    let tickMinute = initialTick;
    tickMinute <= domain.maxMinute;
    tickMinute += tickStep
  ) {
    ticks.push(tickMinute);
  }

  return ticks;
};

/**
 * Format a relative minute value for labels.
 */
export const formatRelativeMinute = (value: number | null): string => {
  if (value === null) {
    return "--";
  }

  const clockValue = formatMinutesAsClock(value);
  if (value < 0) {
    return `-${clockValue}`;
  }

  return clockValue;
};

/**
 * Resolve current relative minute against STD date/time.
 */
export const getCurrentRelativeMinute = (
  stdDate?: string | null,
  stdTime?: string | null,
  nowTimestamp: number = Date.now(),
): number | null => {
  if (!stdDate || !stdTime) {
    return null;
  }

  const parsedDate = parseDateValue(stdDate);
  const parsedTime = parseTimeValue(stdTime);
  if (!parsedDate || !parsedTime) {
    return null;
  }

  const stdDateTime = new Date(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    parsedTime.hours,
    parsedTime.minutes,
    0,
    0,
  );
  if (Number.isNaN(stdDateTime.getTime())) {
    return null;
  }

  return (nowTimestamp - stdDateTime.getTime()) / 60000;
};

/**
 * Format current local time as HH:mm.
 */
export const formatCurrentClockTime = (
  timestamp: number = Date.now(),
): string => {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

/**
 * Resolve timeline width from domain size using a fixed minute-to-pixel ratio.
 */
export const getTimelineWidth = (
  domain: TimelineDomain,
  pixelsPerMinute: number = PIXELS_PER_MINUTE,
): number => {
  const pixels = (domain.maxMinute - domain.minMinute) * pixelsPerMinute;
  return Math.max(TIMELINE_MIN_WIDTH, pixels);
};

const EXPECTED_BAR_PENDING_COLOR    = "#cfcfcf";   // planned/pending — gray
const EXPECTED_BAR_COMPLETED_COLOR  = "#a8d5b5";   // completed — light green
const EXPECTED_BAR_DELAYED_COLOR    = "#f5c6c6";   // delayed — light red
const REAL_BAR_GREEN = "#07605B";   // within planned range
const REAL_BAR_RED   = "#C8001E";   // exceeded planned range
const REAL_BAR_BLUE  = "#2C31C9";   // in progress (not yet finished)

/**
 * Resolve color for the planned (calculated) bar based on the task status from the backend.
 * - IN_PROGRESS : shimmer blue — handled by the row itself via a linearGradient
 * - COMPLETED   : light green (task finished)
 * - DELAYED     : light red (behind schedule)
 * - Default     : gray (pending / unknown)
 */
export const getExpectedBarColor = (row: TimelineTaskRowData): string => {
  if (row.isDelayed) return EXPECTED_BAR_DELAYED_COLOR;
  if (row.task.estado === 'COMPLETED') return EXPECTED_BAR_COMPLETED_COLOR;
  return EXPECTED_BAR_PENDING_COLOR;
};

/**
 * Resolve color for the real (actual) bar:
 * - Blue  : task is still in progress (finReal is null) - SIEMPRE azul mientras está en progreso
 * - Green : task completed within the calculated planned range (inicio y fin dentro del tiempo)
 * - Red   : task completed but exceeded the calculated planned range (inicio o fin fuera del tiempo)
 */
export const getRealBarColor = (row: TimelineTaskRowData): string => {
  // Si está en progreso (no tiene finReal), SIEMPRE es azul
  if (!row.task.finReal) return REAL_BAR_BLUE;

  // Si está completado, verificar si hay atraso en inicio o fin
  if (row.realRange && row.calculatedRange) {
    const startDelayed = row.realRange.startMinute > row.calculatedRange.startMinute + 0.5;
    const endDelayed = row.realRange.endMinute > row.calculatedRange.endMinute + 0.5;
    
    // Si el inicio o el fin están atrasados, es rojo
    if (startDelayed || endDelayed) {
      return REAL_BAR_RED;
    }
  }

  return REAL_BAR_GREEN;
};
