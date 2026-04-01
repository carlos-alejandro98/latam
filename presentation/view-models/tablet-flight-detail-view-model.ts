import type { Flight } from '@/domain/entities/flight';
import type {
  FlightGantt,
  FlightGanttTask,
  GanttDateTime,
} from '@/domain/entities/flight-gantt';
import { filterTasksVisibleOnFront } from '@/presentation/components/flight-gantt-timeline/flight-gantt-timeline.utils';
import {
  resolveAvailableTime,
  resolveConfirmedPushOutTime,
  resolveMtd,
  resolveTaskImpactSummary,
  type FlightMtdTone,
} from '@/presentation/view-models/flight-available-time';

const FALLBACK_TEXT = '--';
const FALLBACK_TIME = '--:--';
const ETD_FALLBACK_TEXT = '----';

export type TabletTaskCategory = 'all' | 'aircraft' | 'services' | 'cargo';
export type TabletTaskStatusTone = 'completed' | 'in_progress' | 'pending';

export interface TabletFlightBadgeViewModel {
  label: string;
  tone: 'neutral' | 'soft';
}

export interface TabletFlightStatViewModel {
  label: string;
  value: string;
}

export interface TabletFlightLegViewModel {
  title: 'ARRIVAL' | 'DEPARTURE';
  stationLabel: string;
  flightNumber: string;
  dateLabel: string;
  serviceBadgeLabel?: string | null;
  terminalBadgeLabel?: string | null;
  badges: TabletFlightBadgeViewModel[];
  statusBadgeLabel: string;
  primaryStats: TabletFlightStatViewModel[];
  boxValue: string;
  actionTimeLabel: string;
  actionTimeValue: string;
}

export interface TabletCargoOverviewViewModel {
  holdBags: string;
  gateBags: string;
  specialItems: Array<{
    id: string;
    label: string;
    value: string;
  }>;
}

export interface TabletFlightTaskViewModel {
  id: string;
  /** instanceId used by /start and /finish endpoints (e.g. "TATA320-CARGO-ARR-BTW-LA3620-2026-03-02") */
  instanceId: string;
  title: string;
  category: Exclude<TabletTaskCategory, 'all'>;
  scheduledRangeLabel: string;
  startTimeLabel: string;
  endTimeLabel: string;
  /** Real start time as "HH:mm" — null if not started yet */
  realStartTime: string | null;
  /** Real end time as "HH:mm" — null if not finished yet */
  realEndTime: string | null;
  plannedStartTime: string;
  plannedEndTime: string;
  durationLabel: string;
  statusLabel: string;
  statusTone: TabletTaskStatusTone;
  searchText: string;
  tipoEvento: string;
}

export interface TabletFlightDetailViewModel {
  header: {
    registrationLabel: string;
    fleetLabel: string;
    availableTimeLabel: string;
    availableTimeDelayed: boolean;
    mtdLabel: string;
    mtdTone: FlightMtdTone;
    availableEndDate: string | null;
    availableEndTime: string | null;
    stdDate: string | null;
    stdTime: string | null;
    /** Confirmed push-back timestamp used to freeze the countdown. */
    pushOutTime: string | null;
    allTasksCompleted: boolean;
  };
  arrival: TabletFlightLegViewModel;
  departure: TabletFlightLegViewModel;
  cargo: TabletCargoOverviewViewModel;
  tasks: TabletFlightTaskViewModel[];
}

const formatShortDate = (value?: string | null): string => {
  if (!value) {
    return '--/--';
  }

  const datePart = value.split('T')[0]?.trim();
  if (!datePart) {
    return '--/--';
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

  return '--/--';
};

const formatTimeValue = (value?: string | GanttDateTime): string => {
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

const formatCount = (value?: number | null): string => {
  if (value === null || value === undefined) {
    return FALLBACK_TEXT;
  }

  return String(value);
};

const formatMinutesToCompact = (minutes?: number | null): string => {
  if (minutes === null || minutes === undefined) {
    return FALLBACK_TIME;
  }

  return `${Math.max(0, minutes)}m`;
};

const getOperationalStatusLabel = (value?: string | null): string => {
  return value ? 'REAL' : 'EST';
};

const getTerminalLabel = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const terminalMatch = value.match(/\bT\d+\b/i);
  if (terminalMatch) {
    return terminalMatch[0].toUpperCase();
  }

  return null;
};

const buildLegBadges = (
  serviceBadgeLabel?: string | null,
  terminalBadgeLabel?: string | null,
): TabletFlightBadgeViewModel[] => {
  const badges: TabletFlightBadgeViewModel[] = [];

  if (serviceBadgeLabel) {
    badges.push({ label: serviceBadgeLabel, tone: 'soft' });
  }

  if (terminalBadgeLabel) {
    badges.push({ label: terminalBadgeLabel, tone: 'neutral' });
  }

  return badges;
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

  const start = new Date(`${startDate}T${startTime}:00`);
  const end = new Date(`${endDate}T${endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  let diff = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diff < 0) {
    diff += 24 * 60;
  }

  return diff;
};

const getFleetLabel = (
  tatType?: string | null,
  aircraftType?: string | null,
): string => {
  if (tatType) {
    const match = tatType.match(/A\d{3}/i);
    if (match) {
      return match[0].toUpperCase();
    }
  }

  return aircraftType || FALLBACK_TEXT;
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

const categorizeTask = (
  task: FlightGanttTask,
): Exclude<TabletTaskCategory, 'all'> => {
  const searchable = [
    task.taskName,
    task.grupoFuncional,
    task.fase,
    task.tipoEvento,
  ]
    .join(' ')
    .toLowerCase();

  if (/(carga|cargo|bag|bodega|mala|bagagem|equipaje)/.test(searchable)) {
    return 'cargo';
  }

  if (
    /(catering|serv|service|limpeza|combust|abastec|atendimento|bus)/.test(
      searchable,
    )
  ) {
    return 'services';
  }

  return 'aircraft';
};

/**
 * Maps the backend `estado` string to one of three tones.
 *
 * The backend returns English values: "COMPLETED", "IN_PROGRESS", "PENDING".
 * We also accept legacy Spanish values just in case.
 * We ONLY use `finReal` / `inicioReal` as secondary signals — we intentionally
 * ignore `deberiaEstarCompletada` / `deberiaEstarEnProgreso` because those
 * fields are projections about what *should* have happened, not what *did*
 * happen, and they cause pending tasks to appear as completed.
 */
const getStatusModel = (
  task: FlightGanttTask,
): Pick<TabletFlightTaskViewModel, 'statusLabel' | 'statusTone'> => {
  const s = task.estado.toUpperCase().trim();

  // Definitive: task has a real finish time
  if (task.finReal) {
    return {
      statusLabel: 'Finalizado',
      statusTone: 'completed',
    };
  }

  // HITO with inicioReal is considered completed (single-moment event)
  if (task.tipoEvento?.toUpperCase() === 'HITO' && task.inicioReal) {
    return {
      statusLabel: 'Finalizado',
      statusTone: 'completed',
    };
  }

  // Completed by estado
  if (
    s === 'COMPLETED' ||
    s === 'COMPLETADA' ||
    s === 'FINALIZADO' ||
    s === 'FINALIZADA'
  ) {
    return {
      statusLabel: 'Finalizado',
      statusTone: 'completed',
    };
  }

  // In progress: has real start OR estado says so
  if (
    task.inicioReal ||
    s === 'IN_PROGRESS' ||
    s === 'EN_PROGRESO' ||
    s === 'INICIADA' ||
    s === 'INICIADO' ||
    s === 'EM_ANDAMENTO'
  ) {
    return {
      statusLabel: 'En progreso',
      statusTone: 'in_progress',
    };
  }

  // Default: pending
  return {
    statusLabel: 'Pendiente',
    statusTone: 'pending',
  };
};

const getTaskDurationMinutes = (task: FlightGanttTask): number | null => {
  if (task.duracionReal !== null && task.duracionReal !== undefined) {
    return task.duracionReal;
  }

  if (!task.inicioReal) {
    return null;
  }

  const [year, month, day, hours, minutes] = task.inicioReal;
  const startDate = new Date(year, month - 1, day, hours, minutes);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - startDate.getTime()) / 60000));
};

const ganttDateTimeToHHmm = (
  dt: GanttDateTime | null | undefined,
): string | null => {
  if (!dt || dt.length < 5) return null;
  const h = dt[3] % 24;
  const m = dt[4];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const buildTaskViewModel = (
  task: FlightGanttTask,
): TabletFlightTaskViewModel => {
  const status = getStatusModel(task);
  const scheduledStart = formatTimeValue(task.inicioProgramado);
  const scheduledEnd = formatTimeValue(task.finProgramado);
  const realStart = ganttDateTimeToHHmm(task.inicioReal);
  const realEnd = ganttDateTimeToHHmm(task.finReal);

  return {
    id: task.taskId,
    instanceId: task.instanceId,
    title: task.taskName,
    category: categorizeTask(task),
    scheduledRangeLabel: `${scheduledStart} - ${scheduledEnd}`,
    /** Inicio / Término / Hora de Marco: solo tiempos reales; si no hay, `--:--`. */
    startTimeLabel: realStart ?? FALLBACK_TIME,
    endTimeLabel: realEnd ?? FALLBACK_TIME,
    realStartTime: realStart,
    realEndTime: realEnd,
    plannedStartTime: formatTimeValue(
      task.inicioProgramado ?? task.inicioCalculado,
    ),
    plannedEndTime: formatTimeValue(task.finProgramado ?? task.finCalculado),
    durationLabel: formatMinutesToCompact(getTaskDurationMinutes(task)),
    statusLabel: status.statusLabel,
    statusTone: status.statusTone,
    searchText: [task.taskName, task.grupoFuncional, task.fase, task.tipoEvento]
      .join(' ')
      .toLowerCase(),
    tipoEvento: task.tipoEvento,
  };
};

export const createTabletFlightDetailViewModel = (
  flight: Flight,
  gantt?: FlightGantt | null,
  nowTimestamp: number = Date.now(),
): TabletFlightDetailViewModel => {
  const ganttFlight = gantt?.flight;
  const summary = gantt?.summary;
  const ganttTasks = gantt?.tasks ?? [];
  const tasksVisibleOnFront = filterTasksVisibleOnFront(ganttTasks);
  const arrivalBox =
    ganttFlight?.parkPositionArrival ??
    flight.parkPositionArrival ??
    FALLBACK_TEXT;
  const departureBox =
    ganttFlight?.parkPositionDeparture ??
    flight.parkPositionDeparture ??
    FALLBACK_TEXT;
  const gateLabel = ganttFlight?.boardingGate ?? flight.boardingGate ?? null;
  const terminalBadgeLabel = getTerminalLabel(gateLabel);
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
    tasks: ganttTasks,
  });
  const availableEndDate = flight.etdDate || flight.stdDate;
  const availableEndTime = flight.etdTime || flight.stdTime;
  const availableMinutes =
    summary?.tatVueloMinutos ??
    ganttFlight?.tatVueloMinutos ??
    flight.tatVueloMinutos ??
    getMinutesDiff(
      flight.etaDate,
      flight.etaTime,
      availableEndDate,
      availableEndTime,
    );
  const taskImpact = resolveTaskImpactSummary(ganttTasks, nowTimestamp);
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

  const tasks = [...tasksVisibleOnFront]
    .sort((leftTask, rightTask) => {
      return (
        getComparableTaskTimestamp(leftTask) -
        getComparableTaskTimestamp(rightTask)
      );
    })
    .map(buildTaskViewModel);

  return {
    header: {
      registrationLabel:
        ganttFlight?.aircraftPrefix || flight.aircraftPrefix || FALLBACK_TEXT,
      fleetLabel: getFleetLabel(
        summary?.tatType ?? ganttFlight?.tatType ?? flight.tatType,
        flight.aircraftType,
      ),
      availableTimeLabel: availableTime.label,
      availableTimeDelayed: availableTime.isDelayed,
      mtdLabel: mtd.label,
      mtdTone: mtd.tone,
      availableEndDate: availableEndDate ?? null,
      availableEndTime: availableEndTime ?? null,
      stdDate: flight.stdDate ?? null,
      stdTime: flight.stdTime ?? null,
      pushOutTime: confirmedPushOutIsoValue,
      allTasksCompleted:
        ganttTasks.length > 0 &&
        ganttTasks.every(
          (task) =>
            Boolean(task.finReal) ||
            task.estado.toUpperCase().trim() === 'COMPLETED',
        ),
    },
    arrival: {
      title: 'ARRIVAL',
      stationLabel: ganttFlight?.origin ?? flight.origin ?? FALLBACK_TEXT,
      flightNumber:
        flight.numberArrival ?? ganttFlight?.numberArrival ?? FALLBACK_TEXT,
      dateLabel: formatShortDate(flight.staDate || flight.etaDate),
      serviceBadgeLabel: gateLabel,
      terminalBadgeLabel,
      badges: buildLegBadges(gateLabel, terminalBadgeLabel),
      statusBadgeLabel: getOperationalStatusLabel(flight.ata),
      primaryStats: [
        { label: 'STA', value: formatTimeValue(flight.staTime) },
        { label: 'ETA', value: formatTimeValue(flight.etaTime) },
      ],
      boxValue: arrivalBox,
      actionTimeLabel: 'PUSH-IN',
      actionTimeValue: formatTimeValue(pushInValue),
    },
    departure: {
      title: 'DEPARTURE',
      stationLabel:
        ganttFlight?.destination ?? flight.destination ?? FALLBACK_TEXT,
      flightNumber:
        flight.numberDeparture ?? ganttFlight?.numberDeparture ?? FALLBACK_TEXT,
      dateLabel: formatShortDate(flight.stdDate || flight.etdDate),
      serviceBadgeLabel: gateLabel,
      terminalBadgeLabel,
      badges: buildLegBadges(gateLabel, terminalBadgeLabel),
      statusBadgeLabel: getOperationalStatusLabel(flight.atd),
      primaryStats: [
        { label: 'STD', value: formatTimeValue(flight.stdTime) },
        {
          label: 'ETD',
          value: formatEtdDisplayValue(flight.stdTime, flight.etdTime),
        },
      ],
      boxValue: departureBox,
      actionTimeLabel: 'PUSH BACK',
      actionTimeValue: formatTimeValue(pushOutValue),
    },
    cargo: {
      holdBags: formatCount(flight.bagsCnxArrival),
      gateBags: formatCount(flight.bagsCnxDeparture),
      specialItems: [
        {
          id: 'wchr-arr',
          label: 'WCHR ARR',
          value: formatCount(flight.wchrArrival),
        },
        {
          id: 'wchr-dep',
          label: 'WCHR DEP',
          value: formatCount(flight.wchrDeparture),
        },
        {
          id: 'cnx-arr',
          label: 'CNX ARR',
          value: formatCount(flight.paxCnxArrival),
        },
        {
          id: 'cnx-dep',
          label: 'CNX DEP',
          value: formatCount(flight.paxCnxDeparture),
        },
      ],
    },
    tasks,
  };
};
