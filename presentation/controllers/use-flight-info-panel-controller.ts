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

  // Se usa el gantt del store siempre que haya un vuelo activo seleccionado.
  // La responsabilidad de garantizar que el gantt corresponde al vuelo correcto
  // recae en loadFlightGantt (carga inicial) y en el stream SSE (actualizaciones
  // en tiempo real), ambos controlados con el mismo flightId del vuelo activo.
  const resolvedGantt = flight ? gantt : null;

  const shouldUseRequestState =
    Boolean(flight) && requestedFlightId === flight?.flightId;

  const viewModel = useMemo((): FlightInfoPanelViewModel | null => {
    if (!flight) {
      return null;
    }
    console.log('[v0] viewModel recalculándose — tareas en gantt:', resolvedGantt?.tasks.length ?? 'sin gantt', '| flight.flightId:', flight.flightId);
    return createFlightInfoPanelViewModel(flight, resolvedGantt, nowTimestamp);
  }, [flight, resolvedGantt, nowTimestamp]);

  return {
    viewModel,
    loading: shouldUseRequestState ? loading : false,
    error: shouldUseRequestState ? error : undefined,
  };
};
