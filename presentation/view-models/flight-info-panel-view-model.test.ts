import { describe, expect, it } from '@jest/globals';

import type { Flight } from '@/domain/entities/flight';
import type { FlightGantt, FlightGanttTask } from '@/domain/entities/flight-gantt';

import { createFlightInfoPanelViewModel } from './flight-info-panel-view-model';

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
  stdTime: '10:30',
  stdDate: '2025-12-01',
  etdTime: '10:30',
  etdDate: '2025-12-01',
  ata: null,
  std: '2025-12-01T10:30:00',
  atd: null,
  pushIn: '2025-12-01T10:00:00',
  pushOut: null,
  estimatedPushIn: '2025-12-01T09:12:00',
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
  inicioCalculado: [2025, 12, 1, 10, 0],
  finCalculado: [2025, 12, 1, 10, 10],
  estado: 'COMPLETED',
  dependencias: [],
  triggerType: '',
  triggerReference: '',
  triggerOffset: 0,
  dependenciasCompletas: [],
  deberiaEstarEnProgreso: false,
  deberiaEstarCompletada: true,
  progresoActual: 100,
  estaRetrasada: false,
  minutosDeRetraso: 0,
  dependenciasCumplidas: true,
  inicioReal: [2025, 12, 1, 10, 0],
  finReal: [2025, 12, 1, 10, 10],
  duracionReal: 10,
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
    completedTasks: tasks.length,
    inProgressTasks: 0,
    pendingTasks: 0,
    delayedTasks: 0,
    progresoGeneral: 100,
    varianzaTotalMinutos: null,
    tatVueloMinutos: 95,
    tatType: 'A320_CURTO',
  },
});

describe('createFlightInfoPanelViewModel', () => {
  it('subtracts accumulated task delay from the available time and shows MTD in red', () => {
    const viewModel = createFlightInfoPanelViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          finReal: [2025, 12, 1, 10, 15],
          duracionReal: 15,
        }),
      ]),
      new Date('2025-12-01T10:00:00').getTime(),
    );

    expect(viewModel.summary.availableTime).toBe('00:25');
    expect(viewModel.summary.mtdLabel).toBe('MTD -00:05');
    expect(viewModel.summary.mtdTone).toBe('delayed');
  });

  it('keeps the base available time when tasks finish early and shows MTD in green', () => {
    const viewModel = createFlightInfoPanelViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          finReal: [2025, 12, 1, 10, 5],
          duracionReal: 5,
        }),
      ]),
      new Date('2025-12-01T10:00:00').getTime(),
    );

    expect(viewModel.summary.availableTime).toBe('00:30');
    expect(viewModel.summary.mtdLabel).toBe('MTD +00:05');
    expect(viewModel.summary.mtdTone).toBe('ahead');
  });

  it('uses gained time to reduce the delay once the available counter is already negative', () => {
    const viewModel = createFlightInfoPanelViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          finReal: [2025, 12, 1, 10, 5],
          duracionReal: 5,
        }),
      ]),
      new Date('2025-12-01T10:40:00').getTime(),
    );

    expect(viewModel.summary.availableTime).toBe('-00:05');
    expect(viewModel.summary.mtdLabel).toBe('MTD +00:05');
    expect(viewModel.summary.mtdTone).toBe('ahead');
  });

  it('subtracts pending delay from tasks that are not executed on time', () => {
    const viewModel = createFlightInfoPanelViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          estado: 'PENDING',
          inicioReal: null,
          finReal: null,
          duracionReal: null,
          estaRetrasada: true,
          minutosDeRetraso: 8,
        }),
      ]),
      new Date('2025-12-01T10:00:00').getTime(),
    );

    expect(viewModel.summary.availableTime).toBe('00:22');
    expect(viewModel.summary.mtdLabel).toBe('MTD -00:08');
    expect(viewModel.summary.mtdTone).toBe('delayed');
  });

  it('discounts live delay for tasks still in progress after their planned end', () => {
    const viewModel = createFlightInfoPanelViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          estado: 'IN_PROGRESS',
          finReal: null,
          duracionReal: null,
          finCalculado: [2025, 12, 1, 10, 30],
        }),
      ]),
      new Date('2025-12-01T10:20:00').getTime(),
    );

    expect(viewModel.summary.availableTime).toBe('00:00');
    expect(viewModel.summary.mtdLabel).toBe('MTD -00:10');
    expect(viewModel.summary.mtdTone).toBe('delayed');
  });

  it('shows ETD as ---- when ETD and STD are equal', () => {
    const viewModel = createFlightInfoPanelViewModel(baseFlight, null);

    expect(viewModel.departure.infoItems[1]).toEqual({
      label: 'ETD',
      value: '----',
    });
  });

  it('shows Tempo Plan as elapsed time from STA to STD', () => {
    const viewModel = createFlightInfoPanelViewModel(baseFlight, null);
    // STA 05:10 → STD 10:30 same day = 5h 20m (independent of tatVueloMinutos)
    expect(viewModel.subBar.tempoPlan).toBe('05:20');
  });

  it('parses STA/STD with seconds for Tempo Plan', () => {
    const viewModel = createFlightInfoPanelViewModel(
      { ...baseFlight, staTime: '05:10:00', stdTime: '10:30:00' },
      null,
    );
    expect(viewModel.subBar.tempoPlan).toBe('05:20');
  });

  it('falls back to tatVueloMinutos when STA–STD interval is unavailable', () => {
    const viewModel = createFlightInfoPanelViewModel(
      { ...baseFlight, staTime: '', stdTime: '10:30' },
      null,
    );
    expect(viewModel.subBar.tempoPlan).toBe('01:35');
  });

  it('parses STA/STD dates as DD/MM/YYYY for Tempo Plan', () => {
    const viewModel = createFlightInfoPanelViewModel(
      {
        ...baseFlight,
        staDate: '01/12/2025',
        stdDate: '01/12/2025',
      },
      null,
    );
    expect(viewModel.subBar.tempoPlan).toBe('05:20');
  });

  it('uses ISO `std` when stdDate/stdTime are empty', () => {
    const viewModel = createFlightInfoPanelViewModel(
      {
        ...baseFlight,
        stdDate: '',
        stdTime: '',
        std: '2025-12-01T10:30:00',
      },
      null,
    );
    expect(viewModel.subBar.tempoPlan).toBe('05:20');
  });

  it('uses optional ISO `sta` when staDate/staTime are empty', () => {
    const viewModel = createFlightInfoPanelViewModel(
      {
        ...baseFlight,
        staDate: '',
        staTime: '',
        sta: '2025-12-01T05:10:00',
        stdDate: '',
        stdTime: '',
        std: '2025-12-01T10:30:00',
        tatVueloMinutos: null,
      },
      null,
    );
    expect(viewModel.subBar.tempoPlan).toBe('05:20');
  });

  it('keeps the countdown live when only the raw push-out exists without the marked push-back hito', () => {
    const viewModel = createFlightInfoPanelViewModel(
      {
        ...baseFlight,
        pushOut: '2025-12-01T10:35:00',
      },
      null,
    );

    expect(viewModel.summary.pushOutTime).toBeNull();
    expect(viewModel.departure.actionTime.value).toBe('10:35');
  });

  it('freezes the countdown only after the push-back hito is completed', () => {
    const gantt = buildGantt([
      buildTask({
        taskId: 'push-back',
        instanceId: 'push-back-instance',
        taskName: 'Push Back',
        tipoEvento: 'HITO',
        estado: 'COMPLETED',
        inicioReal: [2025, 12, 1, 10, 35],
        finReal: null,
        duracionReal: null,
        inicioProgramado: [2025, 12, 1, 10, 35],
        finProgramado: [2025, 12, 1, 10, 35],
        inicioCalculado: [2025, 12, 1, 10, 35],
        finCalculado: [2025, 12, 1, 10, 35],
      }),
    ]);
    gantt.flight.pushOut = [2025, 12, 1, 10, 35];

    const viewModel = createFlightInfoPanelViewModel(baseFlight, gantt);

    expect(viewModel.summary.pushOutTime).toBe('2025-12-01T10:35:00');
    expect(viewModel.timeline.pushOutTime).toBe('2025-12-01T10:35:00');
  });
  });

  it('uses programmed task times as the default source for event labels and ordering', () => {
    const viewModel = createFlightInfoPanelViewModel(
      baseFlight,
      buildGantt([
        buildTask({
          taskId: 'task-late',
          instanceId: 'task-instance-late',
          taskName: 'Late by calc',
          inicioReal: null,
          finReal: null,
          ultimoEvento: null,
          inicioProgramado: [2025, 12, 1, 10, 10],
          finProgramado: [2025, 12, 1, 10, 20],
          inicioCalculado: [2025, 12, 1, 9, 0],
          finCalculado: [2025, 12, 1, 9, 10],
        }),
        buildTask({
          taskId: 'task-early',
          instanceId: 'task-instance-early',
          taskName: 'Early by schedule',
          inicioReal: null,
          finReal: null,
          ultimoEvento: null,
          inicioProgramado: [2025, 12, 1, 10, 0],
          finProgramado: [2025, 12, 1, 10, 10],
          inicioCalculado: [2025, 12, 1, 10, 30],
          finCalculado: [2025, 12, 1, 10, 40],
        }),
      ]),
      new Date('2025-12-01T10:00:00').getTime(),
    );

    expect(viewModel.events.items.map((item) => item.description)).toEqual([
      'Early by schedule',
      'Late by calc',
    ]);
    expect(viewModel.events.items.map((item) => item.timeLabel)).toEqual([
      '10:00',
      '10:10',
    ]);
  });
});
