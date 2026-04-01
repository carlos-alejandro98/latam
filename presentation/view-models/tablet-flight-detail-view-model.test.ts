import { describe, expect, it } from '@jest/globals';

import type { Flight } from '@/domain/entities/flight';
import type { FlightGantt, FlightGanttTask } from '@/domain/entities/flight-gantt';

import { createTabletFlightDetailViewModel } from './tablet-flight-detail-view-model';

const baseFlight: Flight = {
  flightId: 'FLIGHT-123',
  numberArrival: 'LA1234',
  numberDeparture: 'LA5678',
  origin: 'SCL',
  destination: 'LIM',
  aircraftType: 'A320',
  aircraftPrefix: 'PR-FLIGHT',
  staTime: '05:10',
  staDate: '2025-12-01',
  etaTime: '05:14',
  etaDate: '2025-12-01',
  stdTime: '06:45',
  stdDate: '2025-12-01',
  etdTime: '06:50',
  etdDate: '2025-12-01',
  ata: null,
  std: '2025-12-01T06:45:00',
  atd: null,
  pushIn: null,
  pushOut: null,
  estimatedPushIn: '2025-12-01T05:12:00',
  parkPositionArrival: 'A1',
  parkPositionDeparture: 'B2',
  boardingGate: 'G12',
  paxTotalArrival: 150,
  paxCnxArrival: 20,
  paxLocalArrival: 130,
  paxTotalDeparture: 155,
  paxCnxDeparture: 18,
  paxLocalDeparture: 137,
  wchrArrival: 0,
  wchrDeparture: 0,
  bagsCnxArrival: 0,
  bagsCnxDeparture: 0,
  tatVueloMinutos: 95,
  tatType: 'A320_CURTO',
  varianzaMinutos: 0,
  minutosDesembarqueProyectado: null,
  variacionDesembarque: null,
  factorCarga: null,
  tiempoTotalProyectadoRampa: null,
  variacionRampa: null,
  proporcionCarga: null,
  foArrival: 148,
  foDeparture: 152,
  ganttIniciado: false,
  ganttInicioTimestamp: null,
  ingestionTimestamp: '2025-12-01T04:00:00',
};

const buildTask = (
  overrides: Partial<FlightGanttTask> = {},
): FlightGanttTask => ({
  instanceId: 'task-instance-1',
  taskId: 'task-1',
  taskName: 'Desembarque',
  grupoFuncional: 'OPS',
  tipoEvento: 'TASK',
  fase: 'TURNAROUND',
  esPreTat: false,
  tiempoRelativoInicio: 0,
  tiempoRelativoFin: null,
  duracionPlanificada: 10,
  baseDurationMin: 10,
  inicioProgramado: [2025, 12, 1, 10, 0],
  finProgramado: [2025, 12, 1, 10, 10],
  inicioCalculado: [2025, 12, 1, 10, 2],
  finCalculado: [2025, 12, 1, 10, 12],
  estado: 'PENDING',
  dependencias: [],
  triggerType: '',
  triggerReference: '',
  triggerOffset: 0,
  dependenciasCompletas: [],
  deberiaEstarEnProgreso: false,
  deberiaEstarCompletada: false,
  progresoActual: 0,
  estaRetrasada: false,
  minutosDeRetraso: 0,
  dependenciasCumplidas: true,
  inicioReal: null,
  finReal: null,
  duracionReal: null,
  varianzaInicio: null,
  varianzaFin: null,
  varianzaDuracion: null,
  ultimoUsuario: null,
  ultimoEvento: null,
  notas: null,
  ...overrides,
});

const buildGantt = (tasks: FlightGanttTask[]): FlightGantt => ({
  flight: {
    flightId: baseFlight.flightId,
    numberArrival: baseFlight.numberArrival,
    numberDeparture: baseFlight.numberDeparture,
    aircraftPrefix: baseFlight.aircraftPrefix,
    origin: baseFlight.origin,
    destination: baseFlight.destination,
    ata: null,
    pushOut: null,
    pushIn: null,
    estimatedPushIn: [2025, 12, 1, 9, 12],
    parkPositionArrival: 'A1',
    parkPositionDeparture: 'B2',
    boardingGate: 'G12',
    foArrival: 148,
    foDeparture: 152,
    ganttIniciado: false,
    ganttInicioTimestamp: null,
    tatVueloMinutos: 95,
    tatType: 'A320_CURTO',
  },
  tasks,
  summary: {
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => task.estado === 'COMPLETED').length,
    inProgressTasks: tasks.filter((task) => task.estado === 'IN_PROGRESS').length,
    pendingTasks: tasks.filter((task) => task.estado === 'PENDING').length,
    delayedTasks: 0,
    progresoGeneral: 0,
    varianzaTotalMinutos: null,
    tatVueloMinutos: 95,
    tatType: 'A320_CURTO',
  },
});

describe('createTabletFlightDetailViewModel', () => {
  it('counts down against ETD once the flight-day ETA has passed and exposes MTD', () => {
    const result = createTabletFlightDetailViewModel(
      baseFlight,
      null,
      new Date('2025-12-01T07:00:00').getTime(),
    );

    expect(result.header.availableTimeLabel).toBe('-00:10');
    expect(result.header.availableTimeDelayed).toBe(true);
    expect(result.header.mtdLabel).toBe('MTD 00:00');
    expect(result.header.mtdTone).toBe('neutral');
    expect(result.header.availableEndDate).toBe(baseFlight.etdDate);
    expect(result.header.availableEndTime).toBe(baseFlight.etdTime);
    expect(result.header.stdDate).toBe(baseFlight.stdDate);
    expect(result.header.stdTime).toBe(baseFlight.stdTime);
    expect(result.header.pushOutTime).toBeNull();
    expect(result.header.allTasksCompleted).toBe(false);
  });

  it('marks allTasksCompleted only when every gantt task is completed', () => {
    const result = createTabletFlightDetailViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          estado: 'COMPLETED',
          finReal: [2025, 12, 1, 10, 20],
        }),
      ]),
    );

    expect(result.header.allTasksCompleted).toBe(true);
  });

  it('keeps the real push-back timestamp in the header once it exists', () => {
    const result = createTabletFlightDetailViewModel(
      {
        ...baseFlight,
        pushOut: '2025-12-01T06:53:00',
      },
      null,
    );

    expect(result.header.pushOutTime).toBeNull();
    expect(result.departure.actionTimeValue).toBe('06:53');
  });

  it('prefers the refreshed gantt push-back over the stale flight push-back', () => {
    const result = createTabletFlightDetailViewModel(
      baseFlight,
      buildGantt([buildTask()]),
    );

    const refreshedGantt = buildGantt([
      buildTask(),
      buildTask({
        taskId: 'push-back',
        instanceId: 'push-back-instance',
        taskName: 'Push Back',
        tipoEvento: 'HITO',
        estado: 'COMPLETED',
        inicioReal: [2025, 12, 1, 6, 53],
        finReal: null,
        duracionReal: null,
        inicioProgramado: [2025, 12, 1, 6, 53],
        finProgramado: [2025, 12, 1, 6, 53],
        inicioCalculado: [2025, 12, 1, 6, 53],
        finCalculado: [2025, 12, 1, 6, 53],
      }),
    ]);
    refreshedGantt.flight.pushOut = [2025, 12, 1, 6, 53];

    const refreshedResult = createTabletFlightDetailViewModel(
      baseFlight,
      refreshedGantt,
    );

    expect(result.header.pushOutTime).toBeNull();
    expect(refreshedResult.header.pushOutTime).toBe('2025-12-01T06:53:00');
    expect(refreshedResult.departure.actionTimeValue).toBe('06:53');
  });

  it('shows ETD as ---- when ETD and STD are equal', () => {
    const result = createTabletFlightDetailViewModel(
      {
        ...baseFlight,
        etdTime: baseFlight.stdTime,
      },
      null,
    );

    expect(result.departure.primaryStats[1]).toEqual({
      label: 'ETD',
      value: '----',
    });
  });

  it('shows Inicio/Termino labels only from inicioReal/finReal, not calculated times', () => {
    const result = createTabletFlightDetailViewModel(
      baseFlight,
      buildGantt([buildTask()]),
    );

    const task = result.tasks[0];
    expect(task.startTimeLabel).toBe('--:--');
    expect(task.endTimeLabel).toBe('--:--');
    expect(task.plannedStartTime).toBe('10:00');
    expect(task.plannedEndTime).toBe('10:10');
  });

  it('sorts pending tasks by programmed time before calculated time', () => {
    const result = createTabletFlightDetailViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          taskId: 'task-late',
          instanceId: 'task-instance-late',
          taskName: 'Late by calc',
          inicioProgramado: [2025, 12, 1, 10, 10],
          finProgramado: [2025, 12, 1, 10, 20],
          inicioCalculado: [2025, 12, 1, 9, 0],
          finCalculado: [2025, 12, 1, 9, 10],
          inicioReal: null,
          finReal: null,
        }),
        buildTask({
          taskId: 'task-early',
          instanceId: 'task-instance-early',
          taskName: 'Early by schedule',
          inicioProgramado: [2025, 12, 1, 10, 0],
          finProgramado: [2025, 12, 1, 10, 10],
          inicioCalculado: [2025, 12, 1, 10, 30],
          finCalculado: [2025, 12, 1, 10, 40],
          inicioReal: null,
          finReal: null,
        }),
      ]),
    );

    expect(result.tasks.map((task) => task.title)).toEqual([
      'Early by schedule',
      'Late by calc',
    ]);
  });

  it('shows real start/end when inicioReal and finReal are set', () => {
    const result = createTabletFlightDetailViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          inicioReal: [2025, 12, 1, 10, 5],
          finReal: [2025, 12, 1, 10, 20],
        }),
      ]),
    );

    const task = result.tasks[0];
    expect(task.startTimeLabel).toBe('10:05');
    expect(task.endTimeLabel).toBe('10:20');
  });

  it('omits TASK and HITO rows when visibleOnFront is false', () => {
    const result = createTabletFlightDetailViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          instanceId: 'visible-task',
          taskName: 'Visible task',
        }),
        buildTask({
          instanceId: 'hidden-task',
          taskName: 'Hidden task',
          visibleOnFront: false,
        }),
        buildTask({
          instanceId: 'visible-hito',
          taskName: 'Visible hito',
          tipoEvento: 'HITO',
        }),
        buildTask({
          instanceId: 'hidden-hito',
          taskName: 'Hidden hito',
          tipoEvento: 'HITO',
          visibleOnFront: false,
        }),
      ]),
    );

    expect(result.tasks.map((t) => t.instanceId)).toEqual([
      'visible-task',
      'visible-hito',
    ]);
  });
});
