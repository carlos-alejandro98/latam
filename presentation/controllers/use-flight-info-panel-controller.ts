import { useMemo } from 'react';
import { useEffect } from 'react';

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

  // Diagnóstico: loguear cada vez que cambia el estado del gantt en este controller
  useEffect(() => {
    if (!flight) return;
    console.log(
      `[InfoPanelCtrl] 📊 Estado gantt para flightId: "${flight.flightId}" | ` +
      `loading: ${loading} | error: ${error ?? 'ninguno'} | ` +
      `requestedFlightId: "${requestedFlightId ?? 'undefined'}" | ` +
      `gantt en store: ${gantt ? `${gantt.tasks.length} tareas` : 'null'} | ` +
      `shouldUseRequestState: ${shouldUseRequestState}`,
    );
  }, [flight, loading, error, requestedFlightId, gantt, shouldUseRequestState]);

  const viewModel = useMemo((): FlightInfoPanelViewModel | null => {
    if (!flight) {
      return null;
    }
   console.log(
     `[InfoPanelCtrl] 🔧 Recalculando viewModel — flightId: "${flight.flightId}" | ` +
     `resolvedGantt tasks: ${resolvedGantt?.tasks.length ?? 'null'}`,
   );
    return createFlightInfoPanelViewModel(flight, resolvedGantt, nowTimestamp);
  }, [flight, resolvedGantt, nowTimestamp]);

  return {
    viewModel,
    loading: shouldUseRequestState ? loading : false,
    error: shouldUseRequestState ? error : undefined,
  };
};
