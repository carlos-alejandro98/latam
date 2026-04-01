import { describe, expect, it } from '@jest/globals';

import type { FlightGanttTask } from '@/domain/entities/flight-gantt';

import {
  buildTimelineDomain,
  buildTimelineRows,
  filterTasksVisibleOnFront,
  getRealBarColor,
} from './flight-gantt-timeline.utils';

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
  inicioProgramado: [2026, 3, 19, 10, 0],
  finProgramado: [2026, 3, 19, 10, 10],
  inicioCalculado: [2026, 3, 19, 10, 0],
  finCalculado: [2026, 3, 19, 10, 10],
  estado: 'IN_PROGRESS',
  dependencias: [],
  triggerType: '',
  triggerReference: '',
  triggerOffset: 0,
  dependenciasCompletas: [],
  deberiaEstarEnProgreso: true,
  deberiaEstarCompletada: false,
  progresoActual: 50,
  estaRetrasada: false,
  minutosDeRetraso: 0,
  dependenciasCumplidas: true,
  inicioReal: [2026, 3, 19, 10, 0],
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

describe('flight-gantt-timeline.utils', () => {
  it('uses STA - 2h and STD + 2h as the visible timeline window', () => {
    const domain = buildTimelineDomain(
      [],
      new Date('2026-03-19T04:00:00').getTime(),
      '2026-03-19',
      '05:10',
      null,
      null,
      '2026-03-19',
      '06:45',
      '2026-03-19',
      '06:50',
    );

    expect(domain).toEqual({
      minMinute: 190,
      maxMinute: 525,
      stdMinute: 405,
      timelineStartDateMs: new Date(2026, 2, 19, 0, 0, 0, 0).getTime(),
    });
  });

  it('uses ETA when STA is missing and ETD when STD is missing', () => {
    const domain = buildTimelineDomain(
      [],
      new Date('2026-03-19T04:00:00').getTime(),
      null,
      null,
      '2026-03-19',
      '05:30',
      null,
      null,
      '2026-03-19',
      '06:50',
    );

    expect(domain.minMinute).toBe(210);
    expect(domain.maxMinute).toBe(530);
    expect(domain.stdMinute).toBe(410);
  });

  it('extends the visible end to now + 2h when a task is in progress', () => {
    const domain = buildTimelineDomain(
      [buildTask()],
      new Date('2026-03-19T10:12:00').getTime(),
      '2026-03-19',
      '05:10',
      null,
      null,
      '2026-03-19',
      '06:45',
      '2026-03-19',
      '06:50',
    );

    expect(domain.maxMinute).toBe(732);
  });

  it('keeps next-day tasks visible with continuous minutes beyond midnight', () => {
    const domain = buildTimelineDomain(
      [
        buildTask({
          estado: 'PENDING',
          deberiaEstarEnProgreso: false,
          inicioReal: null,
          finReal: null,
          inicioProgramado: [2026, 3, 20, 0, 10],
          finProgramado: [2026, 3, 20, 0, 20],
          inicioCalculado: [2026, 3, 20, 0, 10],
          finCalculado: [2026, 3, 20, 0, 20],
        }),
      ],
      new Date('2026-03-19T23:30:00').getTime(),
      '2026-03-19',
      '23:00',
      null,
      null,
      '2026-03-20',
      '01:18',
      '2026-03-20',
      '01:20',
    );
    const [row] = buildTimelineRows(
      [
        buildTask({
          estado: 'PENDING',
          deberiaEstarEnProgreso: false,
          inicioReal: null,
          finReal: null,
          inicioProgramado: [2026, 3, 20, 0, 10],
          finProgramado: [2026, 3, 20, 0, 20],
          inicioCalculado: [2026, 3, 20, 0, 10],
          finCalculado: [2026, 3, 20, 0, 20],
        }),
      ],
      domain.timelineStartDateMs,
      domain.stdMinute,
      new Date('2026-03-19T23:30:00').getTime(),
    );

    expect(domain.maxMinute).toBe(1638);
    expect(row.calculatedRange).toEqual({
      startMinute: 1450,
      endMinute: 1460,
    });
  });

  it('uses programmed task times as the default base range before calculated ones', () => {
    const [row] = buildTimelineRows(
      [buildTask()],
      new Date(2026, 2, 19, 0, 0, 0, 0).getTime(),
      620,
      new Date('2026-03-19T10:05:00').getTime(),
    );

    expect(row.calculatedRange).toEqual({
      startMinute: 600,
      endMinute: 610,
    });
  });

  it('keeps the in-progress real bar blue while it is within the planned range', () => {
    const nowTimestamp = new Date('2026-03-19T10:05:00').getTime();
    const domain = buildTimelineDomain(
      [buildTask()],
      nowTimestamp,
      '2026-03-19',
      '05:10',
      null,
      null,
      '2026-03-19',
      '10:20',
      null,
      null,
    );
    const [row] = buildTimelineRows(
      [buildTask()],
      domain.timelineStartDateMs,
      domain.stdMinute,
      nowTimestamp,
    );

    expect(row.realRange?.endMinute).toBe(605);
    expect(getRealBarColor(row)).toBe('#2C31C9');
  });

  it('turns the in-progress real bar red once it exceeds the planned end', () => {
    const nowTimestamp = new Date('2026-03-19T10:12:00').getTime();
    const domain = buildTimelineDomain(
      [buildTask()],
      nowTimestamp,
      '2026-03-19',
      '05:10',
      null,
      null,
      '2026-03-19',
      '10:20',
      null,
      null,
    );
    const [row] = buildTimelineRows(
      [
        buildTask({
          finReal: [2026, 3, 19, 10, 12],
        }),
      ],
      domain.timelineStartDateMs,
      domain.stdMinute,
      nowTimestamp,
    );

    expect(row.realRange?.endMinute).toBe(612);
    expect(getRealBarColor(row)).toBe('#C8001E');
  });

  it('drops tasks when visibleOnFront is false', () => {
    const filtered = filterTasksVisibleOnFront([
      buildTask({ instanceId: 'a', taskId: 't1' }),
      buildTask({
        instanceId: 'b',
        taskId: 't2',
        visibleOnFront: false,
      }),
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].taskId).toBe('t1');
  });
});
