import type { FlightGanttTask, GanttDateTime } from '@/domain/entities/flight-gantt';

import type {
  TimelineBarRange,
  TimelineDomain,
  TimelineMarker,
  TimelineTaskRowData,
} from './flight-gantt-timeline.types';

const MINUTES_PER_DAY = 1440;
const MINUTE_IN_MS = 60000;
const TIMELINE_WINDOW_PADDING_MINUTES = 120;
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
    id: '50',
    percentage: 50,
    pixelsPerMinute: 4.5,
    tickStepMinutes: 15,
  },
  {
    id: '75',
    percentage: 75,
    pixelsPerMinute: 6.5,
    tickStepMinutes: 10,
  },
  {
    id: '100',
    percentage: 100,
    pixelsPerMinute: 9,
    tickStepMinutes: 5,
  },
  {
    id: '125',
    percentage: 125,
    pixelsPerMinute: 11.5,
    tickStepMinutes: 5,
  },
  {
    id: '150',
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
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const formatGanttDateTime = (dt: GanttDateTime): string | null => {
  if (!dt || dt.length < 5) {
    return null;
  }

  const hours = dt[3];
  const minutes = dt[4];
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const normalizedHours = ((hours % 24) + 24) % 24;
  return `${String(normalizedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const formatAbsoluteMinute = (absoluteMinute: number): string => {
  const wrapped =
    ((Math.round(absoluteMinute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const relativeToAbsoluteMinute = (
  relativeMinute: number,
  stdDate?: string | null,
  stdTime?: string | null,
): number | null => {
  const stdDateTime = parseDateTimeValue(stdDate, stdTime);
  if (!stdDateTime) {
    return null;
  }

  const stdAbsoluteMinute = stdDateTime.getHours() * 60 + stdDateTime.getMinutes();
  return (
    ((stdAbsoluteMinute + relativeMinute) % MINUTES_PER_DAY) + MINUTES_PER_DAY
  ) % MINUTES_PER_DAY;
};

const parseDateValue = (
  dateValue?: string | null,
): { day: number; month: number; year: number } | null => {
  if (!dateValue) {
    return null;
  }

  const normalizedDate = dateValue.includes('T')
    ? dateValue.split('T')[0]
    : dateValue;

  if (normalizedDate.includes('/')) {
    const parts = normalizedDate.split('/');
    if (parts.length !== 3) {
      return null;
    }

    if (parts[0]?.length === 4) {
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (!day || !month || !year) {
        return null;
      }

      return { day, month, year };
    }

    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    if (!day || !month || !year) {
      return null;
    }

    return { day, month, year };
  }

  if (normalizedDate.includes('-')) {
    const parts = normalizedDate.split('-');
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
  timeValue?: string | null,
): { hours: number; minutes: number } | null => {
  if (!timeValue) {
    return null;
  }

  const normalizedTime =
    timeValue.includes('T') && timeValue.length >= 16
      ? timeValue.slice(11, 16)
      : timeValue;
  const values = normalizedTime.split(':');
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

const buildDateTime = (
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): Date | null => {
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseDateTimeValue = (
  dateValue?: string | null,
  timeValue?: string | null,
): Date | null => {
  const parsedDate = parseDateValue(dateValue);
  const parsedTime = parseTimeValue(timeValue);
  if (!parsedDate || !parsedTime) {
    return null;
  }

  return buildDateTime(
    parsedDate.year,
    parsedDate.month,
    parsedDate.day,
    parsedTime.hours,
    parsedTime.minutes,
  );
};

const ganttDateTimeToDate = (dt: GanttDateTime): Date | null => {
  if (!dt || dt.length < 5) {
    return null;
  }

  const [year, month, day, hours, minutes] = dt;
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTimelineMinute = (
  date: Date,
  timelineStartDateMs: number,
): number => {
  return (date.getTime() - timelineStartDateMs) / MINUTE_IN_MS;
};

const ganttDateTimeToTimelineMinute = (
  dt: GanttDateTime,
  timelineStartDateMs: number,
): number | null => {
  const date = ganttDateTimeToDate(dt);
  if (!date) {
    return null;
  }

  return getTimelineMinute(date, timelineStartDateMs);
};

const getStartOfDayTimestamp = (date: Date): number => {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
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

const getPlannedDuration = (task: FlightGanttTask): number => {
  return Math.max(
    task.baseDurationMin,
    task.duracionPlanificada,
    MIN_BAR_DURATION_MINUTES,
  );
};

const getCalculatedRange = (
  task: FlightGanttTask,
  timelineStartDateMs: number,
  stdMinute: number | null,
): TimelineBarRange | null => {
  const plannedStart = ganttDateTimeToTimelineMinute(
    task.inicioProgramado,
    timelineStartDateMs,
  );
  const plannedEnd = ganttDateTimeToTimelineMinute(
    task.finProgramado,
    timelineStartDateMs,
  );
  const calculatedStart = ganttDateTimeToTimelineMinute(
    task.inicioCalculado,
    timelineStartDateMs,
  );
  const calculatedEnd = ganttDateTimeToTimelineMinute(
    task.finCalculado,
    timelineStartDateMs,
  );
  const duration = getPlannedDuration(task);

  if (plannedStart !== null && plannedEnd !== null) {
    return clampBarRange(plannedStart, plannedEnd);
  }

  if (plannedStart !== null) {
    return clampBarRange(plannedStart, plannedStart + duration);
  }

  if (plannedEnd !== null) {
    return clampBarRange(plannedEnd - duration, plannedEnd);
  }

  if (calculatedStart !== null && calculatedEnd !== null) {
    return clampBarRange(calculatedStart, calculatedEnd);
  }

  if (calculatedStart !== null) {
    return clampBarRange(calculatedStart, calculatedStart + duration);
  }

  if (calculatedEnd !== null) {
    return clampBarRange(calculatedEnd - duration, calculatedEnd);
  }

  if (stdMinute !== null && Number.isFinite(task.tiempoRelativoInicio)) {
    const startMinute = stdMinute + task.tiempoRelativoInicio;
    const endMinute =
      task.tiempoRelativoFin !== null
        ? stdMinute + task.tiempoRelativoFin
        : startMinute + duration;

    if (Number.isFinite(endMinute)) {
      return clampBarRange(startMinute, endMinute);
    }
  }

  // Last resort: build a synthetic calculated range from real times so the
  // bar is always visible even when no planning data is available.
  const realStart = ganttDateTimeToTimelineMinute(task.inicioReal, timelineStartDateMs);
  const realEnd = ganttDateTimeToTimelineMinute(task.finReal, timelineStartDateMs);

  if (realStart !== null && realEnd !== null) {
    return clampBarRange(realStart, realEnd);
  }

  if (realStart !== null) {
    return clampBarRange(realStart, realStart + duration);
  }

  if (realEnd !== null) {
    return clampBarRange(realEnd - duration, realEnd);
  }

  return null;
};

const getRealStartMinute = (
  task: FlightGanttTask,
  calculatedRange: TimelineBarRange | null,
  timelineStartDateMs: number,
): number | null => {
  const realStart = ganttDateTimeToTimelineMinute(
    task.inicioReal,
    timelineStartDateMs,
  );
  if (realStart !== null) {
    return realStart;
  }

  if (!calculatedRange) {
    return null;
  }

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
  calculatedRange: TimelineBarRange | null,
  realStartMinute: number | null,
  timelineStartDateMs: number,
): number | null => {
  const realEnd = ganttDateTimeToTimelineMinute(task.finReal, timelineStartDateMs);
  if (realEnd !== null) {
    return realEnd;
  }

  if (!calculatedRange) {
    return null;
  }

  if (task.varianzaFin !== null) {
    return calculatedRange.endMinute + task.varianzaFin;
  }

  if (realStartMinute !== null && task.duracionReal !== null) {
    return realStartMinute + task.duracionReal;
  }

  return null;
};

const getRealRange = (
  task: FlightGanttTask,
  calculatedRange: TimelineBarRange | null,
  timelineStartDateMs: number,
  nowTimestamp: number,
): TimelineBarRange | null => {
  const realStartMinute = getRealStartMinute(
    task,
    calculatedRange,
    timelineStartDateMs,
  );
  if (realStartMinute === null) {
    return null;
  }

  let realEndMinute = getRealEndMinute(
    task,
    calculatedRange,
    realStartMinute,
    timelineStartDateMs,
  );

  // Always extend in-progress tasks to now, or any task that has a real start
  // but no real end (covers completed tasks that only have inicioReal).
  if (realEndMinute === null) {
    if (task.estado === 'IN_PROGRESS' || task.inicioReal !== null) {
      realEndMinute = getTimelineMinute(new Date(nowTimestamp), timelineStartDateMs);
    }
  }

  if (realEndMinute === null) {
    return null;
  }

  if (realEndMinute <= realStartMinute) {
    realEndMinute = realStartMinute + 1;
  }

  return clampBarRange(realStartMinute, realEndMinute);
};

const getTaskCandidateTimestamps = (task: FlightGanttTask): number[] => {
  const candidates = [
    task.inicioProgramado,
    task.finProgramado,
    task.inicioCalculado,
    task.finCalculado,
    task.inicioReal,
    task.finReal,
    task.ultimoEvento,
  ];

  return candidates
    .map(ganttDateTimeToDate)
    .filter((date): date is Date => date !== null)
    .map((date) => date.getTime());
};

const getEarliestTaskTimestamp = (
  tasks: FlightGanttTask[],
): number | null => {
  const timestamps = tasks.flatMap(getTaskCandidateTimestamps);
  if (!timestamps.length) {
    return null;
  }

  return Math.min(...timestamps);
};

const getLatestTaskTimestamp = (
  tasks: FlightGanttTask[],
): number | null => {
  const timestamps = tasks.flatMap(getTaskCandidateTimestamps);
  if (!timestamps.length) {
    return null;
  }

  return Math.max(...timestamps);
};

const isTaskInProgressAtNow = (
  task: FlightGanttTask,
  nowTimestamp: number,
): boolean => {
  if (task.tipoEvento === 'HITO') {
    return false;
  }

  const realStart = ganttDateTimeToDate(task.inicioReal);
  const realEnd = ganttDateTimeToDate(task.finReal);
  if (realStart && realStart.getTime() <= nowTimestamp) {
    if (!realEnd) {
      return true;
    }

    return realEnd.getTime() >= nowTimestamp;
  }

  if (task.estado === 'IN_PROGRESS') {
    return true;
  }

  return !!task.deberiaEstarEnProgreso && !task.deberiaEstarCompletada;
};

const resolveStartAnchor = (
  tasks: FlightGanttTask[],
  staDate?: string | null,
  staTime?: string | null,
  etaDate?: string | null,
  etaTime?: string | null,
  stdDate?: string | null,
  stdTime?: string | null,
  etdDate?: string | null,
  etdTime?: string | null,
): Date => {
  const explicitStart =
    parseDateTimeValue(staDate, staTime) ??
    parseDateTimeValue(etaDate, etaTime) ??
    parseDateTimeValue(stdDate, stdTime) ??
    parseDateTimeValue(etdDate, etdTime);
  if (explicitStart) {
    return explicitStart;
  }

  const earliestTaskTimestamp = getEarliestTaskTimestamp(tasks);
  return earliestTaskTimestamp ? new Date(earliestTaskTimestamp) : new Date();
};

const resolveReferenceDateTime = (
  stdDate?: string | null,
  stdTime?: string | null,
  etdDate?: string | null,
  etdTime?: string | null,
): Date | null => {
  return (
    parseDateTimeValue(stdDate, stdTime) ??
    parseDateTimeValue(etdDate, etdTime)
  );
};

const resolveEndAnchor = (
  tasks: FlightGanttTask[],
  nowTimestamp: number,
  referenceDateTime: Date | null,
): Date => {
  if (tasks.some((task) => isTaskInProgressAtNow(task, nowTimestamp))) {
    return new Date(nowTimestamp);
  }

  if (referenceDateTime) {
    return referenceDateTime;
  }

  const latestTaskTimestamp = getLatestTaskTimestamp(tasks);
  return latestTaskTimestamp ? new Date(latestTaskTimestamp) : new Date(nowTimestamp);
};

export const buildTimelineRows = (
  tasks: FlightGanttTask[],
  timelineStartDateMs: number,
  stdMinute: number | null,
  nowTimestamp: number = Date.now(),
): TimelineTaskRowData[] => {
  return tasks.map((task) => {
    const calculatedRange = getCalculatedRange(
      task,
      timelineStartDateMs,
      stdMinute,
    );
    const realRange = getRealRange(
      task,
      calculatedRange,
      timelineStartDateMs,
      nowTimestamp,
    );

    return {
      calculatedRange,
      estado: task.estado,
      isDelayed: task.estaRetrasada,
      realRange,
      task,
    };
  });
};

export const buildTimelineMarkers = (
  tatVueloMinutos?: number | null,
  currentRelativeMinute?: number | null,
  currentMarkerLabel?: string,
  stdMinute: number | null = null,
  stdLabel: string = 'STD',
): TimelineMarker[] => {
  if (stdMinute === null) {
    return [];
  }

  const markers: TimelineMarker[] = [
    {
      color: '#c2005b',
      id: 'std',
      label: stdLabel,
      labelVariant: 'outlined',
      lineStyle: 'dashed',
      minute: stdMinute,
    },
  ];

  if (tatVueloMinutos && tatVueloMinutos > 0) {
    markers.push({
      color: '#d61b5b',
      id: 'push-in',
      label: 'PUSH-IN',
      labelBackgroundColor: '#d61b5b',
      labelTextColor: '#ffffff',
      labelVariant: 'filled',
      lineStyle: 'dashed',
      minute: stdMinute - tatVueloMinutos,
    });
  }

  if (currentRelativeMinute !== null && currentRelativeMinute !== undefined) {
    markers.push({
      color: '#2836c9',
      id: 'current',
      label: currentMarkerLabel ?? 'NOW',
      labelBackgroundColor: '#2836c9',
      labelTextColor: '#ffffff',
      labelVariant: 'filled',
      lineStyle: 'solid',
      minute: stdMinute + currentRelativeMinute,
    });
  }

  return markers;
};

export const buildTimelineDomain = (
  tasks: FlightGanttTask[],
  nowTimestamp: number = Date.now(),
  staDate?: string | null,
  staTime?: string | null,
  etaDate?: string | null,
  etaTime?: string | null,
  stdDate?: string | null,
  stdTime?: string | null,
  etdDate?: string | null,
  etdTime?: string | null,
): TimelineDomain => {
  const startAnchor = resolveStartAnchor(
    tasks,
    staDate,
    staTime,
    etaDate,
    etaTime,
    stdDate,
    stdTime,
    etdDate,
    etdTime,
  );
  const referenceDateTime = resolveReferenceDateTime(
    stdDate,
    stdTime,
    etdDate,
    etdTime,
  );
  const endAnchor = resolveEndAnchor(tasks, nowTimestamp, referenceDateTime);

  const domainStartDateTime = new Date(
    startAnchor.getTime() - TIMELINE_WINDOW_PADDING_MINUTES * MINUTE_IN_MS,
  );
  const domainEndDateTime = new Date(
    endAnchor.getTime() + TIMELINE_WINDOW_PADDING_MINUTES * MINUTE_IN_MS,
  );

  const safeEndDateTime =
    domainEndDateTime.getTime() > domainStartDateTime.getTime()
      ? domainEndDateTime
      : new Date(
          domainStartDateTime.getTime() +
            4 * TIMELINE_WINDOW_PADDING_MINUTES * MINUTE_IN_MS,
        );

  const timelineStartDateMs = getStartOfDayTimestamp(domainStartDateTime);

  return {
    maxMinute: getTimelineMinute(safeEndDateTime, timelineStartDateMs),
    minMinute: getTimelineMinute(domainStartDateTime, timelineStartDateMs),
    stdMinute:
      referenceDateTime !== null
        ? getTimelineMinute(referenceDateTime, timelineStartDateMs)
        : null,
    timelineStartDateMs,
  };
};

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

export const formatRelativeMinute = (value: number | null): string => {
  if (value === null) {
    return '--';
  }

  const clockValue = formatMinutesAsClock(value);
  if (value < 0) {
    return `-${clockValue}`;
  }

  return clockValue;
};

export const getCurrentRelativeMinute = (
  stdDate?: string | null,
  stdTime?: string | null,
  nowTimestamp: number = Date.now(),
): number | null => {
  const stdDateTime = parseDateTimeValue(stdDate, stdTime);
  if (!stdDateTime) {
    return null;
  }

  return (nowTimestamp - stdDateTime.getTime()) / MINUTE_IN_MS;
};

export const formatCurrentClockTime = (
  timestamp: number = Date.now(),
): string => {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const getTimelineWidth = (
  domain: TimelineDomain,
  pixelsPerMinute: number = PIXELS_PER_MINUTE,
): number => {
  const pixels = (domain.maxMinute - domain.minMinute) * pixelsPerMinute;
  return Math.max(TIMELINE_MIN_WIDTH, pixels);
};

const EXPECTED_BAR_PENDING_COLOR = '#cfcfcf';
const EXPECTED_BAR_COMPLETED_COLOR = '#a8d5b5';
const EXPECTED_BAR_DELAYED_COLOR = '#f5c6c6';
const REAL_BAR_GREEN = '#07605B';
const REAL_BAR_RED = '#C8001E';
const REAL_BAR_BLUE = '#2C31C9';

export const getExpectedBarColor = (row: TimelineTaskRowData): string => {
  if (row.isDelayed) {
    return EXPECTED_BAR_DELAYED_COLOR;
  }

  if (row.task.estado === 'COMPLETED') {
    return EXPECTED_BAR_COMPLETED_COLOR;
  }

  return EXPECTED_BAR_PENDING_COLOR;
};

export const getRealBarColor = (row: TimelineTaskRowData): string => {
  if (!row.task.finReal) {
    return REAL_BAR_BLUE;
  }

  if (row.realRange && row.calculatedRange) {
    const startDelayed =
      row.realRange.startMinute > row.calculatedRange.startMinute + 0.5;
    const endDelayed =
      row.realRange.endMinute > row.calculatedRange.endMinute + 0.5;
    if (startDelayed || endDelayed) {
      return REAL_BAR_RED;
    }
  }

  return REAL_BAR_GREEN;
};
