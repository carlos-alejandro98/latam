import { useMemo } from 'react';

import type { Flight } from '@/domain/entities/flight';
import { useMinuteTimestamp } from '@/presentation/hooks/use-minute-timestamp';
import {
  createFlightInfoPanelViewModel,
  type FlightInfoPanelViewModel,
} from '@/presentation/view-models/flight-info-panel-view-model';

import { useFlightGanttController } from './use-flight-gantt-controller';

export const useFlightInfoPanelController = (
  flight: Flight | null,
): {
  viewModel: FlightInfoPanelViewModel | null;
  loading: boolean;
  error: string | undefined;
} => {
  const nowTimestamp = useMinuteTimestamp();
  const {
    gantt,
    loading,
    error,
    flightId: requestedFlightId,
  } = useFlightGanttController(flight?.flightId);

  // Se acepta el gantt si el flightId coincide exactamente, o si el flightId
  // del gantt está contenido en el flightId del vuelo (para cubrir formatos compuestos
  // como "LA3228-BEL-2026-03-31" vs "LA3228-BEL").
  const ganttFlightId = gantt?.flight?.flightId;
  const flightIdMatch =
    ganttFlightId === flight?.flightId ||
    (ganttFlightId != null &&
      flight?.flightId != null &&
      (flight.flightId.startsWith(ganttFlightId) ||
        ganttFlightId.startsWith(flight.flightId)));

  const resolvedGantt = flight && ganttFlightId && flightIdMatch ? gantt : null;

  console.log(
    '[InfoPanelController] flight.flightId:', flight?.flightId,
    '| gantt.flight.flightId:', ganttFlightId,
    '| idMatch:', flightIdMatch,
    '| resolvedGantt:', resolvedGantt ? `${resolvedGantt.tasks.length} tareas` : 'null',
    '| loading:', loading,
  );

  const shouldUseRequestState =
    Boolean(flight) && requestedFlightId === flight?.flightId;

  const viewModel = useMemo((): FlightInfoPanelViewModel | null => {
    if (!flight) {
      return null;
    }

    return createFlightInfoPanelViewModel(flight, resolvedGantt, nowTimestamp);
  }, [flight, resolvedGantt, nowTimestamp]);

  return {
    viewModel,
    loading: shouldUseRequestState ? loading : false,
    error: shouldUseRequestState ? error : undefined,
  };
};
