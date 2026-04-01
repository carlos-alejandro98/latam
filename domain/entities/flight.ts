export interface Flight {
  flightId: string;

  numberArrival: string;
  numberDeparture: string;

  origin: string;
  destination: string;

  aircraftType: string | null;
  aircraftPrefix?: string | null;

  staTime: string;
  staDate: string;

  etaTime: string;
  etaDate: string;

  stdTime: string;
  stdDate: string;

  etdTime: string;
  etdDate: string;

  ata: string | null;
  /** ISO local (p. ej. llegada programada) si la API no envía `staDate`/`staTime` por separado. */
  sta?: string | null;
  std: string; // ISO timestamp
  atd: string | null;

  pushIn: string | null;
  pushOut: string | null;
  estimatedPushIn: string | null;

  parkPositionArrival: string | null;
  parkPositionDeparture: string | null;
  boardingGate: string | null;

  paxTotalArrival: number;
  paxCnxArrival: number;
  paxLocalArrival: number;

  paxTotalDeparture: number;
  paxCnxDeparture: number;
  paxLocalDeparture: number;

  wchrArrival: number;
  wchrDeparture: number;

  bagsCnxArrival: number;
  bagsCnxDeparture: number;

  tatVueloMinutos: number | null;
  tatType: string | null;
  varianzaMinutos: number | null;

  minutosDesembarqueProyectado: number | null;
  variacionDesembarque: number | null;

  factorCarga: number | null;

  tiempoTotalProyectadoRampa: number | null;
  variacionRampa: number | null;
  proporcionCarga: number | null;

  foArrival: number;
  foDeparture: number;

  ganttIniciado: boolean;
  ganttInicioTimestamp: string | null;

  ingestionTimestamp: string;
}
