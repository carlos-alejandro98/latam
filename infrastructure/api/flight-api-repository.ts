import type { DateRangeParams, FlightRepositoryPort } from "@/application/ports/flight-repository-port";
import type { Flight } from "@/domain/entities/flight";
import { FlightError } from "@/domain/errors/flight-error";
import type { FlightGantt, FlightGanttTask, GanttDateTime } from "@/domain/entities/flight-gantt";
import { flightsHttpGet, flightsHttpPost } from "@/infrastructure/http/flights-http-methods";
import { getDefaultDateRange } from "@/shared/utils/date-utils";
import axios from "axios";

// Shape returned by the new /api/v1/turnarounds/flight/gantt endpoint
interface TurnaroundApiTask {
  instanceId: string;
  taskId: string;
  taskName: string;
  taskType: string;
  phase: string;
  groupFunctional: string;
  scheduledStart: GanttDateTime;
  scheduledEnd: GanttDateTime;
  scheduledDurationMin: number;
  calculatedStart: GanttDateTime;
  calculatedEnd: GanttDateTime;
  calculatedDurationMin: number;
  actualStart: GanttDateTime;
  actualEnd: GanttDateTime;
  actualDurationMin: number | null;
  status: string;
  dependencies: string[] | null;
  dependenciesMet: boolean;
  varianceStartMin: number | null;
  varianceEndMin: number | null;
  varianceDurationMin: number | null;
  isDelayed: boolean;
  delayMinutes: number | null;
  progressPercent: number;
  shouldBeInProgress: boolean;
  shouldBeCompleted: boolean;
}

interface TurnaroundApiResponse {
  turnaroundId: string;
  flightId: string;
  flightNumber: string;
  aircraftType: string;
  aircraftRegistration: string;
  aircraftPrefix: string | null;
  airport: string;
  gate: string | null;
  origin: string;
  destination: string;
  ganttStarted: boolean;
  ganttStartTimestamp: GanttDateTime;
  tatFlightMinutes: number | null;
  tatType: string | null;
  status: string;
  flightIndicators: {
    sta: GanttDateTime;
    std: GanttDateTime;
    eta: GanttDateTime;
    etd: GanttDateTime;
    ata: GanttDateTime;
    atd: GanttDateTime;
    pushIn: GanttDateTime;
    pushOut: GanttDateTime;
    engineOff: GanttDateTime;
    doorsOpen: GanttDateTime;
  };
  occupancyFactors: {
    paxCount: number | null;
    paxCapacity: number | null;
    factorOcupacion: number | null;
    paxWchr: number | null;
    paxUmnr: number | null;
    bagsCount: number | null;
    cargoWeightKg: number | null;
    isInternational: boolean;
  };
  tasks: TurnaroundApiTask[];
  foArrival: number;
  foDeparture: number;
  parkPositionArrival: string | null;
  estimatedPushIn: GanttDateTime;
}

function mapTurnaroundToFlightGantt(raw: TurnaroundApiResponse): FlightGantt {
  const tasks: FlightGanttTask[] = raw.tasks.map((t) => ({
    instanceId:               t.instanceId,
    taskId:                   t.taskId,
    taskName:                 t.taskName,
    grupoFuncional:           t.groupFunctional,
    tipoEvento:               t.taskType,
    fase:                     t.phase,
    esPreTat:                 t.phase === 'PRE_ARRIVAL',
    tiempoRelativoInicio:     0,
    tiempoRelativoFin:        null,
    duracionPlanificada:      t.scheduledDurationMin,
    baseDurationMin:          t.scheduledDurationMin,
    inicioProgramado:         t.scheduledStart,
    finProgramado:            t.scheduledEnd,
    inicioCalculado:          t.calculatedStart,
    finCalculado:             t.calculatedEnd,
    estado:                   t.status,
    dependencias:             t.dependencies ?? [],
    triggerType:              '',
    triggerReference:         '',
    triggerOffset:            0,
    dependenciasCompletas:    [],
    deberiaEstarEnProgreso:   t.shouldBeInProgress,
    deberiaEstarCompletada:   t.shouldBeCompleted,
    progresoActual:           t.progressPercent,
    estaRetrasada:            t.isDelayed,
    minutosDeRetraso:         t.delayMinutes ?? 0,
    dependenciasCumplidas:    t.dependenciesMet,
    inicioReal:               t.actualStart,
    finReal:                  t.actualEnd,
    duracionReal:             t.actualDurationMin,
    varianzaInicio:           t.varianceStartMin,
    varianzaFin:              t.varianceEndMin,
    varianzaDuracion:         t.varianceDurationMin,
    ultimoUsuario:            null,
    ultimoEvento:             null,
    notas:                    null,
  }));

  const completedTasks  = tasks.filter((t) => t.estado === 'COMPLETED').length;
  const inProgressTasks = tasks.filter((t) => t.estado === 'IN_PROGRESS').length;
  const pendingTasks    = tasks.filter((t) => t.estado === 'PENDING').length;
  const delayedTasks    = tasks.filter((t) => t.estaRetrasada).length;

  return {
    turnaroundId:           raw.turnaroundId,
    flight: {
      flightId:               raw.flightId,
      numberArrival:          raw.flightNumber,
      numberDeparture:        raw.flightNumber,
      aircraftPrefix:         raw.aircraftPrefix,
      origin:                 raw.origin,
      destination:            raw.destination,
      ata:                    raw.flightIndicators.ata,
      pushIn:                 null,
      estimatedPushIn:        raw.estimatedPushIn,
      parkPositionArrival:    raw.parkPositionArrival,
      parkPositionDeparture:  null,
      boardingGate:           raw.gate,
      foArrival:              raw.foArrival,
      foDeparture:            raw.foDeparture,
      ganttIniciado:          raw.ganttStarted,
      ganttInicioTimestamp:   raw.ganttStartTimestamp,
      tatVueloMinutos:        raw.tatFlightMinutes,
      tatType:                raw.tatType,
    },
    tasks,
    summary: {
      totalTasks:             tasks.length,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      delayedTasks,
      progresoGeneral:        tasks.length ? (completedTasks / tasks.length) * 100 : 0,
      varianzaTotalMinutos:   null,
      tatVueloMinutos:        raw.tatFlightMinutes,
      tatType:                raw.tatType,
    },
  };
}

export class FlightApiRepository implements FlightRepositoryPort {
  /**
   * Obtiene los vuelos activos para un rango de fechas.
   * Si no se proporcionan fechas, usa un rango por defecto de 3 días antes y después de hoy.
   * Formato requerido por el endpoint: ddMMyyyy (ej: 25032026 para 25/03/2026)
   */
  async getActiveFlights(dateRange?: DateRangeParams) {
    // Usar fechas del parametro o calcular rango por defecto
    const defaultRange = getDefaultDateRange();
    const stdDateFrom = dateRange?.stdDateFrom ?? defaultRange.stdDateFrom;
    const stdDateTo = dateRange?.stdDateTo ?? defaultRange.stdDateTo;
    
    console.log(`[FlightApiRepository] Fetching active flights with stdDateFrom=${stdDateFrom}, stdDateTo=${stdDateTo}`);
    
    const flights = await flightsHttpGet<Flight[]>("/api/v1/tracking/active-flights-v2", {
      stdDateFrom,
      stdDateTo,
    });
    
    console.log(`[FlightApiRepository] Received ${flights?.length ?? 0} flights`);
    
    return flights;
  }

  async getFlightGantt(flightId: string): Promise<FlightGantt> {
    try {
      const raw = await flightsHttpGet<TurnaroundApiResponse>(
        "/api/v1/turnarounds/flight/gantt",
        { flightId },
      );
      
      // Log de todas las tareas con sus campos relevantes para debug
      console.log(`[FlightApiRepository] Gantt tasks for flight ${flightId}:`, 
        raw.tasks.map(t => ({
          taskName: t.taskName,
          status: t.status,
          actualStart: t.actualStart,
          actualEnd: t.actualEnd,
          isDelayed: t.isDelayed,
          shouldBeInProgress: t.shouldBeInProgress,
          shouldBeCompleted: t.shouldBeCompleted,
        }))
      );
      
      return mapTurnaroundToFlightGantt(raw);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new FlightError(
          `No turnaround gantt found for flight ${flightId}`,
          "GANTT_NOT_FOUND",
        );
      }

      throw error;
    }
  }

  async refreshTurnaroundMetrics(turnaroundId: string): Promise<void> {
    await flightsHttpPost<unknown, undefined>(
      `/api/v1/turnarounds/${turnaroundId}/refresh-metrics`,
      undefined,
    );
  }
}
