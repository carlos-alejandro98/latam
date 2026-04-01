export type GanttDateTime = [number, number, number, number, number] | null;

export interface FlightGanttInfo {
  flightId: string;
  numberArrival: string;
  numberDeparture: string;
  aircraftPrefix?: string | null;
  origin: string;
  destination: string;
  ata: GanttDateTime;
  pushOut?: GanttDateTime;
  pushIn: string | null;
  estimatedPushIn: GanttDateTime;
  parkPositionArrival: string | null;
  parkPositionDeparture: string | null;
  boardingGate: string | null;
  foArrival: number;
  foDeparture: number;
  ganttIniciado: boolean;
  ganttInicioTimestamp: GanttDateTime;
  tatVueloMinutos: number | null;
  tatType: string | null;
}

export interface FlightGanttTask {
  instanceId: string;
  taskId: string;
  taskName: string;
  grupoFuncional: string;
  tipoEvento: string;
  fase: string;
  esPreTat: boolean;
  tiempoRelativoInicio: number;
  tiempoRelativoFin: number | null;
  duracionPlanificada: number;
  baseDurationMin: number;
  inicioProgramado: GanttDateTime;
  finProgramado: GanttDateTime;
  inicioCalculado: GanttDateTime;
  finCalculado: GanttDateTime;
  estado: string;
  dependencias: string[];
  triggerType: string;
  triggerReference: string;
  triggerOffset: number;
  dependenciasCompletas: string[];
  deberiaEstarEnProgreso: boolean;
  deberiaEstarCompletada: boolean;
  progresoActual: number;
  estaRetrasada: boolean;
  minutosDeRetraso: number;
  dependenciasCumplidas: boolean;
  inicioReal: GanttDateTime;
  finReal: GanttDateTime;
  duracionReal: number | null;
  varianzaInicio: number | null;
  varianzaFin: number | null;
  varianzaDuracion: number | null;
  ultimoUsuario: string | null;
  ultimoEvento: GanttDateTime;
  notas: string | null;
  /**
   * Si es `false`, la tarea no se muestra en el listado/barras del Gantt frontal.
   * Ausente o `true`: se muestra (compatibilidad con APIs sin el campo).
   */
  visibleOnFront?: boolean;
}

export interface FlightGanttSummary {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  delayedTasks: number;
  progresoGeneral: number;
  varianzaTotalMinutos: number | null;
  tatVueloMinutos: number | null;
  tatType: string | null;
}

export interface FlightGantt {
  turnaroundId?: string;
  flight: FlightGanttInfo;
  tasks: FlightGanttTask[];
  summary: FlightGanttSummary;
}
