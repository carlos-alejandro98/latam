import type { Flight } from '@/domain/entities/flight';
import type {
  FlightGantt,
  FlightGanttTask,
  GanttDateTime,
} from '@/domain/entities/flight-gantt';
import {
  resolveAvailableTime,
  resolveConfirmedPushOutTime,
  resolveMtd,
  resolveTaskImpactSummary,
  type FlightMtdTone,
} from '@/presentation/view-models/flight-available-time';

export type FlightInfoPanelTagType = 'successSoftDot' | 'infoSoftDot';

export interface FlightInfoPanelInfoItemViewModel {
  label: string;
  value: string;
}

export interface FlightInfoPanelStatusViewModel {
  label: string;
  type: FlightInfoPanelTagType;
}

export interface FlightInfoPanelSideViewModel {
  title: 'ARRIVAL' | 'DEPARTURE';
  flightNumber: string;
  dateLabel: string;
  passengerCount: string;
  station: string;
  infoItems: FlightInfoPanelInfoItemViewModel[];
  status?: FlightInfoPanelStatusViewModel;
  actionTime: {
    label: string;
    value: string;
  };
}

export interface FlightInfoPanelSummaryViewModel {
  prefix: string;
  fleetLabel: string;
  availableTime: string;
  availableTimeDelayed: boolean;
  mtdLabel: string;
  mtdTone: FlightMtdTone;
  /** Countdown target date (ETD when present, otherwise STD). */
  availableEndDate: string | null;
  /** Countdown target time (ETD when present, otherwise STD). */
  availableEndTime: string | null;
  /** STD date string retained for other summary consumers. */
  stdDate: string | null;
  /** STD time string retained for other summary consumers. */
  stdTime: string | null;
  /** Confirmed push-back timestamp used to freeze the countdown. */
  pushOutTime: string | null;
  /** True when every gantt task has a real finish time — stops the countdown */
  allTasksCompleted: boolean;
}

export interface FlightInfoPanelEventItemViewModel {
  id: string;
  timeLabel: string;
  description: string;
  source?: string;
  eventType?: 'started' | 'finished';
  isDelayed?: boolean;
  taskInstanceId?: string;
  sortTimestamp?: number;
}

export interface FlightInfoPanelEventsViewModel {
  title: string;
  items: FlightInfoPanelEventItemViewModel[]; // Tareas SIGA
  hitoItems: FlightInfoPanelEventItemViewModel[]; // Eventos inicio/fin real
  alertItems: FlightInfoPanelEventItemViewModel[]; // Alertas
  chatItems: FlightInfoPanelEventItemViewModel[]; // Chat
  emptyMessage: string;
}

export interface FlightInfoPanelTimelineViewModel {
  staDate?: string | null;
  staTime?: string | null;
  etaDate?: string | null;
  etaTime?: string | null;
  stdDate?: string | null;
  stdTime?: string | null;
  etdDate?: string | null;
  etdTime?: string | null;
  pushOutTime?: string | null;
  tatVueloMinutos?: number | null;
  tasks: FlightGanttTask[];
}

export interface FlightInfoPanelSubBarViewModel {
  pnaeArrival: string;
  paxCnxArrival: string;
  bagsCnxArrival: string;
  pnaeDeparture: string;
  paxCnxDeparture: string;
  bagsCnxDeparture: string;
  wchrArrival: string;
  wchrDeparture: string;
  routeType: string | null; // e.g. "DOM - INTER"
  /** Plan fijo (no cuenta regresiva): STA→STD en minutos o, si no aplica, `tatVueloMinutos` API. */
  tempoPlan: string | null;
}

export interface FlightInfoPanelViewModel {
  arrival: FlightInfoPanelSideViewModel;
  departure: FlightInfoPanelSideViewModel;
  summary: FlightInfoPanelSummaryViewModel;
  subBar: FlightInfoPanelSubBarViewModel;
  timeline: FlightInfoPanelTimelineViewModel;
  events: FlightInfoPanelEventsViewModel;
}

const FALLBACK_DATE = '--/--';
const FALLBACK_TIME = '--:--';
const FALLBACK_TEXT = '--';
const ETD_FALLBACK_TEXT = '----';

const formatShortDate = (value?: string | null): string => {
  if (!value) {
    return FALLBACK_DATE;
  }

  const datePart = value.split('T')[0]?.trim();
  if (!datePart) {
    return FALLBACK_DATE;
  }

  if (datePart.includes('-')) {
    const parts = datePart.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
  }

  if (datePart.includes('/')) {
    const parts = datePart.split('/');
    if (parts.length === 3) {
      const [first, second, third] = parts;
      if (first.length === 4) {
        return `${third}/${second}`;
      }

      return `${first}/${second}`;
    }
  }

  return FALLBACK_DATE;
};

const formatTimeValue = (
  value?: string | [number, number, number, number, number] | null,
): string => {
  if (!value) {
    return FALLBACK_TIME;
  }

  if (Array.isArray(value)) {
    const hours = value[3];
    const minutes = value[4];
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (value.includes('T') && value.length >= 16) {
    return value.slice(11, 16);
  }

  return value;
};

const ganttDateTimeToIsoString = (
  value?: GanttDateTime,
): string | null => {
  if (!value || value.length < 5) {
    return null;
  }

  const [year, month, day, hours, minutes] = value;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
};

const formatEtdDisplayValue = (
  stdTime?: string | null,
  etdTime?: string | null,
): string => {
  const formattedStd = formatTimeValue(stdTime);
  const formattedEtd = formatTimeValue(etdTime);

  if (
    etdTime &&
    formattedStd !== FALLBACK_TIME &&
    formattedEtd !== FALLBACK_TIME &&
    formattedStd === formattedEtd
  ) {
    return ETD_FALLBACK_TEXT;
  }

  return formattedEtd;
};

const formatMinutesToTime = (minutes?: number | null): string => {
  if (
    minutes === null ||
    minutes === undefined ||
    typeof minutes !== 'number' ||
    Number.isNaN(minutes)
  ) {
    return FALLBACK_TIME;
  }

  const totalMinutes = Math.max(0, minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const getFleetFromTatType = (tatType?: string | null): string => {
  if (!tatType) {
    return '';
  }

  const match = tatType.match(/A\d{3}/i);
  return match ? match[0].toUpperCase() : '';
};

const formatCount = (value?: number | null): string => {
  if (value === null || value === undefined) {
    return FALLBACK_TEXT;
  }

  return String(value);
};

const getEventTimeLabel = (task: FlightGanttTask): string => {
  return formatTimeValue(
    task.ultimoEvento ??
      task.inicioReal ??
      task.inicioProgramado ??
      task.finProgramado ??
      task.inicioCalculado ??
      task.finCalculado,
  );
};

const getComparableTaskTimestamp = (task: FlightGanttTask): number => {
  const dateTime =
    task.ultimoEvento ??
    task.inicioReal ??
    task.inicioProgramado ??
    task.finProgramado ??
    task.inicioCalculado ??
    task.finCalculado;

  if (!dateTime) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [year, month, day, hours, minutes] = dateTime;
  return new Date(year, month - 1, day, hours, minutes).getTime();
};

const sortTasksByTimeline = (tasks: FlightGanttTask[]): FlightGanttTask[] => {
  return [...tasks].sort((leftTask, rightTask) => {
    return (
      getComparableTaskTimestamp(leftTask) -
      getComparableTaskTimestamp(rightTask)
    );
  });
};

const buildSigaItems = (
  tasks: FlightGanttTask[],
): FlightInfoPanelEventItemViewModel[] => {
  return sortTasksByTimeline(tasks).map((task) => ({
    id: task.taskId,
    timeLabel: getEventTimeLabel(task),
    description: task.taskName,
    source: 'SIGA',
    taskInstanceId: task.instanceId,
    sortTimestamp: getComparableTaskTimestamp(task),
  }));
};

const ganttDateTimeToMs = (dt: GanttDateTime): number => {
  if (!dt) return Number.MAX_SAFE_INTEGER;
  const [year, month, day, hours, minutes] = dt;
  return new Date(year, month - 1, day, hours, minutes).getTime();
};

const buildHitoItems = (
  tasks: FlightGanttTask[],
): FlightInfoPanelEventItemViewModel[] => {
  const items: FlightInfoPanelEventItemViewModel[] = [];

  for (const task of tasks) {
    if (task.inicioReal) {
      const delayMin = Math.max(0, task.varianzaInicio ?? 0);
      const isDelayed = delayMin > 0;

      items.push({
        id: `${task.instanceId}-start`,
        timeLabel: formatTimeValue(task.inicioReal),
        description: `Início ${task.taskName}`,
        source: 'INICIO',
        eventType: 'started',
        isDelayed,
        taskInstanceId: task.instanceId,
        sortTimestamp: ganttDateTimeToMs(task.inicioReal),
      });
    }

    if (task.finReal) {
      const delayMin = Math.max(0, task.varianzaFin ?? 0);
      const isDelayed = delayMin > 0;

      items.push({
        id: `${task.instanceId}-end`,
        timeLabel: formatTimeValue(task.finReal),
        description: `Fim ${task.taskName}`,
        source: 'FIN',
        eventType: 'finished',
        isDelayed,
        taskInstanceId: task.instanceId,
        sortTimestamp: ganttDateTimeToMs(task.finReal),
      });
    }
  }

  return items.sort((a, b) => (a.sortTimestamp ?? 0) - (b.sortTimestamp ?? 0));
};

/** Convierte `DD/MM/YYYY` o `DD-MM-YYYY` a `YYYY-MM-DD` (turnaround LATAM). */
const normalizeCalendarDateForParse = (dateStr: string): string => {
  const d = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return d;
  }

  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(d);
  if (m) {
    const day = String(m[1]).padStart(2, '0');
    const month = String(m[2]).padStart(2, '0');
    return `${m[3]}-${month}-${day}`;
  }

  return d;
};

/** `YYYY-MM-DD` + hora local del payload (sin offset) desde ISO tipo `2025-12-01T10:30:00`. */
const splitIsoLikeDateTime = (
  value?: string | null,
): { date: string; time: string } | null => {
  if (!value?.trim()) {
    return null;
  }

  const matched = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)/.exec(
    value.trim(),
  );
  if (!matched) {
    return null;
  }

  return { date: matched[1], time: matched[2] };
};

type FlightWithOptionalStaIso = Flight & { sta?: string | null };

const resolveStaPartsForPlan = (
  flight: Flight,
): { date: string; time: string } | null => {
  const sd = flight.staDate?.trim();
  const st = flight.staTime?.trim();
  if (sd && st) {
    return { date: sd, time: st };
  }

  const staIso = (flight as FlightWithOptionalStaIso).sta;
  return splitIsoLikeDateTime(typeof staIso === 'string' ? staIso : null);
};

const resolveStdPartsForPlan = (
  flight: Flight,
): { date: string; time: string } | null => {
  const sd = flight.stdDate?.trim();
  const st = flight.stdTime?.trim();
  if (sd && st) {
    return { date: sd, time: st };
  }

  return splitIsoLikeDateTime(flight.std);
};

/** Fecha+hora local para diff; acepta `HH:mm` o `HH:mm:ss` (sin añadir `:00` dos veces). */
const parseLocalDateTime = (dateStr: string, timeStr: string): Date | null => {
  const d = normalizeCalendarDateForParse(dateStr.trim());
  const t = timeStr.trim();
  if (!d || !t) {
    return null;
  }

  const colons = (t.match(/:/g) ?? []).length;
  const iso = colons >= 2 ? `${d}T${t}` : `${d}T${t}:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getMinutesDiff = (
  startDate?: string | null,
  startTime?: string | null,
  endDate?: string | null,
  endTime?: string | null,
): number | null => {
  if (!startDate || !startTime || !endDate || !endTime) {
    return null;
  }

  const start = parseLocalDateTime(startDate, startTime);
  const end = parseLocalDateTime(endDate, endTime);
  if (!start || !end) {
    return null;
  }

  let diff = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diff < 0) {
    diff += 24 * 60;
  }

  return diff;
};

export const createFlightInfoPanelViewModel = (
  flight: Flight,
  gantt?: FlightGantt | null,
  nowTimestamp: number = Date.now(),
): FlightInfoPanelViewModel => {
  const ganttFlight = gantt?.flight;
  const ganttSummary = gantt?.summary;
  const timelineTasks = gantt?.tasks ?? [];

  const numberArrival =
    flight.numberArrival ?? ganttFlight?.numberArrival ?? FALLBACK_TEXT;
  const numberDeparture =
    flight.numberDeparture ?? ganttFlight?.numberDeparture ?? FALLBACK_TEXT;
  const prefix =
    ganttFlight?.aircraftPrefix || flight.aircraftPrefix || FALLBACK_TEXT;
  const arrivalPark =
    ganttFlight?.parkPositionArrival ??
    flight.parkPositionArrival ??
    FALLBACK_TEXT;
  const departureBox =
    ganttFlight?.parkPositionDeparture ??
    flight.parkPositionDeparture ??
    FALLBACK_TEXT;
  const boardingGate =
    ganttFlight?.boardingGate ?? flight.boardingGate ?? FALLBACK_TEXT;
  const pushInValue =
    ganttFlight?.pushIn ??
    ganttFlight?.estimatedPushIn ??
    flight.estimatedPushIn ??
    flight.pushIn;
  const pushOutValue = ganttFlight?.pushOut ?? flight.pushOut;
  const pushOutIsoValue =
    ganttDateTimeToIsoString(ganttFlight?.pushOut) ?? flight.pushOut ?? null;
  const confirmedPushOutIsoValue = resolveConfirmedPushOutTime({
    pushOut: pushOutIsoValue,
    tasks: timelineTasks,
  });
  const isArrivalReal = Boolean(ganttFlight?.ata ?? flight.ata);
  const tatMinutes =
    ganttSummary?.tatVueloMinutos ??
    ganttFlight?.tatVueloMinutos ??
    flight.tatVueloMinutos;
  const tatType =
    ganttSummary?.tatType ?? ganttFlight?.tatType ?? flight.tatType;
  const fleetLabel =
    getFleetFromTatType(tatType) || flight.aircraftType || FALLBACK_TEXT;
  const availableEndDate = flight.etdDate || flight.stdDate;
  const availableEndTime = flight.etdTime || flight.stdTime;
  const availableMinutes =
    tatMinutes ??
    getMinutesDiff(
      flight.etaDate,
      flight.etaTime,
      availableEndDate,
      availableEndTime,
    );
  /** Ventana planificada STA→STD (fija). Fechas DD/MM, ISO en `std`/`sta`, TAT como respaldo. */
  const staParts = resolveStaPartsForPlan(flight);
  const stdParts = resolveStdPartsForPlan(flight);
  const planStaStdMinutes =
    staParts && stdParts
      ? getMinutesDiff(staParts.date, staParts.time, stdParts.date, stdParts.time)
      : null;
  const tempoPlanMinutes = planStaStdMinutes ?? tatMinutes ?? null;
  const taskImpact = resolveTaskImpactSummary(timelineTasks, nowTimestamp);
  const availableTime = resolveAvailableTime({
    endDate: availableEndDate,
    endTime: availableEndTime,
    fallbackMinutes: availableMinutes,
    nowTimestamp,
    start: ganttFlight?.pushIn ?? flight.pushIn,
    startDate: flight.etaDate,
    startTime: flight.etaTime,
    taskDelayMinutes: taskImpact.delayMinutes,
    taskGainMinutes: taskImpact.gainMinutes,
  });
  const mtd = resolveMtd(taskImpact.netImpactMinutes);
  const origin = ganttFlight?.origin ?? flight.origin ?? FALLBACK_TEXT;
  const destination =
    ganttFlight?.destination ?? flight.destination ?? FALLBACK_TEXT;
  const foArrivalValue = ganttFlight?.foArrival ?? flight.foArrival;
  const foDepartureValue = ganttFlight?.foDeparture ?? flight.foDeparture;

  return {
    arrival: {
      title: 'ARRIVAL',
      flightNumber: numberArrival,
      dateLabel: formatShortDate(flight.staDate),
      passengerCount: formatCount(foArrivalValue),
      station: origin,
      infoItems: [
        { label: 'STA', value: formatTimeValue(flight.staTime) },
        { label: 'ETA', value: formatTimeValue(flight.etaTime) },
        { label: 'BOX', value: arrivalPark },
        { label: 'PORTAO', value: boardingGate },
      ],
      status: {
        label: isArrivalReal ? 'REAL' : 'PREV',
        type: isArrivalReal ? 'successSoftDot' : 'infoSoftDot',
      },
      actionTime: {
        label: 'PUSH-IN',
        value: formatTimeValue(pushInValue),
      },
    },
    departure: {
      title: 'DEPARTURE',
      flightNumber: numberDeparture,
      dateLabel: formatShortDate(flight.staDate),
      passengerCount: formatCount(foDepartureValue),
      station: destination,
      infoItems: [
        { label: 'STD', value: formatTimeValue(flight.stdTime) },
        {
          label: 'ETD',
          value: formatEtdDisplayValue(flight.stdTime, flight.etdTime),
        },
        { label: 'BOX', value: departureBox },
        { label: 'PORTÃO', value: boardingGate },
      ],
      actionTime: {
        label: 'PUSH-BACK',
        value: formatTimeValue(pushOutValue),
      },
    },
    summary: {
      prefix,
      fleetLabel,
      availableTime: availableTime.label,
      availableTimeDelayed: availableTime.isDelayed,
      mtdLabel: mtd.label,
      mtdTone: mtd.tone,
      availableEndDate: availableEndDate ?? null,
      availableEndTime: availableEndTime ?? null,
      stdDate: flight.stdDate ?? null,
      stdTime: flight.stdTime ?? null,
      pushOutTime: confirmedPushOutIsoValue,
      allTasksCompleted:
        timelineTasks.length > 0 &&
        timelineTasks.every(
          (t) =>
            Boolean(t.finReal) || t.estado.toUpperCase().trim() === 'COMPLETED',
        ),
    },
    subBar: {
      pnaeArrival: formatCount(flight.wchrArrival),
      paxCnxArrival: formatCount(flight.paxCnxArrival),
      bagsCnxArrival: formatCount(flight.bagsCnxArrival),
      pnaeDeparture: formatCount(flight.wchrDeparture),
      paxCnxDeparture: formatCount(flight.paxCnxDeparture),
      bagsCnxDeparture: formatCount(flight.bagsCnxDeparture),
      wchrArrival: formatCount(flight.wchrArrival),
      wchrDeparture: formatCount(flight.wchrDeparture),
      routeType: ganttFlight?.tatType ?? flight.tatType ?? null,
      tempoPlan: formatMinutesToTime(tempoPlanMinutes),
    },
    timeline: {
      staDate: flight.staDate,
      staTime: flight.staTime,
      etaDate: flight.etaDate,
      etaTime: flight.etaTime,
      stdDate: flight.stdDate,
      stdTime: flight.stdTime,
      etdDate: flight.etdDate,
      etdTime: flight.etdTime,
      pushOutTime: pushOutIsoValue,
      tasks: timelineTasks,
      tatVueloMinutos: tatMinutes,
    },
    events: {
      title: 'Eventos de Voo',
      items: buildSigaItems(timelineTasks),
      hitoItems: buildHitoItems(timelineTasks),
      alertItems: [],
      chatItems: [],
      emptyMessage: 'Sin eventos disponibles para este vuelo.',
    },
  };
};
