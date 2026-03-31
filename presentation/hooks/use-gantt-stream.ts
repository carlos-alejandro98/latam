import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import { ENV } from '@/config/environment';
import { FlightsHttpClient } from '@/infrastructure/http/flights-http-client';
import type { AppDispatch } from '@/store';
import { fetchFlightGantt } from '@/store/slices/flight-gantt-slice';

// Los logs del stream se emiten siempre, independiente de ENV.enableLogs,
// para que el equipo pueda diagnosticar problemas de conectividad en cualquier entorno.
const PREFIX = '[GanttStream]';
const log = (...args: unknown[]) => console.log(PREFIX, ...args);
const warn = (...args: unknown[]) => console.warn(PREFIX, ...args);
const logError = (...args: unknown[]) => console.error(PREFIX, ...args);

const SSE_PATH = '/api/v1/tracking/active-flights/stream';
const INTERVAL_SECONDS = 5;
const HEARTBEAT_INTERVAL = 20;
/** Reconectar si no llega ningún evento SSE dentro de esta ventana */
const STALE_TIMEOUT_MS = 45_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/**
 * Se conecta al stream SSE de vuelos activos y mantiene el gantt del vuelo
 * seleccionado actualizado en tiempo real, sin causar parpadeos de carga.
 *
 * Ciclo de vida:
 * - Abre una nueva conexión cada vez que cambia `activeFlightId`.
 * - Cierra limpiamente la conexión anterior antes de abrir la nueva.
 * - Reconecta con backoff exponencial + jitter ante error o timeout de inactividad.
 * - Destruye todo al desmontar el componente.
 */
export function useGanttStream(
  activeFlightId: string | null | undefined,
): void {
  const dispatch = useDispatch<AppDispatch>();

  // Ref estable para que los event handlers siempre vean el flightId más reciente
  const activeFlightIdRef = useRef<string | null | undefined>(activeFlightId);
  activeFlightIdRef.current = activeFlightId;

  useEffect(() => {
    if (!activeFlightId) {
      log('No hay vuelo activo seleccionado, no se abre el stream.');
      return;
    }

    log(`Iniciando stream para el vuelo: ${activeFlightId}`);

    let mounted = true;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    // ── Helpers ────────────────────────────────────────────────────────────

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const clearStaleTimer = () => {
      if (staleTimer) {
        clearTimeout(staleTimer);
        staleTimer = null;
      }
    };

    const closeEs = () => {
      if (es) {
        log('Cerrando conexión SSE existente.');
        es.close();
        es = null;
      }
    };

    const teardown = () => {
      log(`Destruyendo stream del vuelo: ${activeFlightId}`);
      mounted = false;
      clearReconnectTimer();
      clearStaleTimer();
      closeEs();
    };

    const resetStaleTimer = () => {
      clearStaleTimer();
      staleTimer = setTimeout(() => {
        if (!mounted) return;
        warn('La conexión lleva demasiado tiempo sin recibir eventos. Reconectando...');
        scheduleReconnect();
      }, STALE_TIMEOUT_MS);
    };

    /**
     * Recarga el gantt del vuelo activo usando el thunk fetchFlightGantt.
     * Esto garantiza que state.flightId y state.data se actualicen juntos,
     * lo que es necesario para que la condición resolvedGantt en el controller
     * evalúe correctamente y dispare el re-render del componente.
     * El estado loading se activa brevemente pero es aceptable para actualizaciones en vivo.
     */
    const reloadGantt = (flightId: string) => {
      log(`Recargando datos del gantt para el vuelo: ${flightId}`);
      dispatch(fetchFlightGantt(flightId))
        .unwrap()
        .then((data) => {
          if (!mounted) return;
          log(`Gantt actualizado con ${data.tasks.length} tareas para el vuelo: ${flightId}`);
        })
        .catch((err: unknown) => {
          logError(`Error al recargar el gantt del vuelo ${flightId}:`, err);
          // Se mantienen los datos existentes en caso de error
        });
    };

    // ── Reconexión con backoff exponencial + jitter ──────────────────────

    const scheduleReconnect = () => {
      if (!mounted) return;
      closeEs();
      clearReconnectTimer();
      const backoff = Math.min(
        BACKOFF_BASE_MS * 2 ** retryCount,
        BACKOFF_MAX_MS,
      );
      const delay = backoff + Math.random() * 1000;
      retryCount += 1;
      log(`Reconectando en ${Math.round(delay)}ms (intento #${retryCount})`);
      reconnectTimer = setTimeout(() => {
        if (mounted) connect(); // eslint-disable-line @typescript-eslint/no-use-before-define
      }, delay);
    };

    // ── Conexión SSE ─────────────────────────────────────────────────────

    const connect = () => {
      if (!mounted) return;
      closeEs();

      // Se usa FlightsHttpClient (que apunta a flightsApiBaseUrl) para leer
      // el token, ya que el SSE también apunta al mismo servidor de vuelos.
      const baseUrl = ENV.flightsApiBaseUrl ?? '';
      const url = `${baseUrl}${SSE_PATH}?interval_seconds=${INTERVAL_SECONDS}&heartbeat_interval=${HEARTBEAT_INTERVAL}`;

      // EventSource no soporta headers personalizados — se adjunta el Bearer token como query param
      const authHeader = FlightsHttpClient.defaults.headers.common[
        'Authorization'
      ] as string | undefined;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;

      if (!token) {
        warn('No se encontró token de autenticación. El stream puede ser rechazado por el servidor.');
      }

      const finalUrl = token
        ? `${url}&token=${encodeURIComponent(token)}`
        : url;

      log(`Abriendo conexión SSE → ${baseUrl}${SSE_PATH} | token presente: ${!!token}`);

      es = new EventSource(finalUrl);
      resetStaleTimer();

      es.addEventListener('connected', () => {
        if (!mounted) return;
        retryCount = 0;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        log(`Conexión establecida con el servidor. Cargando gantt del vuelo: ${fid ?? 'ninguno'}`);
        if (fid) reloadGantt(fid);
      });

      es.addEventListener('flight_updated', (event: MessageEvent) => {
        if (!mounted) return;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        if (!fid) return;

        // Se loguea el dato crudo para facilitar el diagnóstico en consola
        log(`Evento 'flight_updated' recibido. Datos crudos: ${event.data}`);

        try {
          const payload = JSON.parse(event.data as string) as Record<string, unknown>;

          // El servidor puede mandar el ID del vuelo en distintos campos según la versión del backend.
          // Se normalizan todas las variantes conocidas para no perder actualizaciones.
          const eventFlightId =
            (payload.flightId as string | undefined) ??
            (payload.flight_id as string | undefined) ??
            (payload.id as string | undefined);

          log(`flightId extraído del evento: ${eventFlightId ?? 'no especificado'} | vuelo activo en pantalla: ${fid}`);

          const isSameFlight = eventFlightId === undefined || eventFlightId === fid;

          if (isSameFlight) {
            log(`Actualizando gantt del vuelo activo (${fid})...`);
            reloadGantt(fid);
          } else {
            log(`El evento es para el vuelo ${eventFlightId}, no para el activo (${fid}). Se ignora.`);
          }
        } catch {
          // Si el payload no es JSON válido, igual se recarga para no perder la actualización
          warn(`Payload no es JSON válido. Se recarga el gantt de todas formas para el vuelo: ${fid}`);
          reloadGantt(fid);
        }
      });

      es.addEventListener('flight_added', (event: MessageEvent) => {
        if (!mounted) return;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        if (!fid) return;
        log(`Evento 'flight_added' recibido. Datos crudos: ${event.data} | Recargando gantt del vuelo: ${fid}`);
        reloadGantt(fid);
      });

      es.addEventListener('flight_removed', (event: MessageEvent) => {
        if (!mounted) return;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        if (!fid) return;
        log(`Evento 'flight_removed' recibido. Datos crudos: ${event.data} | Recargando gantt del vuelo: ${fid}`);
        reloadGantt(fid);
      });

      es.addEventListener('heartbeat', () => {
        if (!mounted) return;
        log('Heartbeat recibido. Conexión activa.');
        resetStaleTimer();
      });

      es.addEventListener('error', (event) => {
        if (!mounted) return;
        logError('Error en la conexión SSE. Se intentará reconectar.', event);
        clearStaleTimer();
        closeEs();
        scheduleReconnect();
      });
    };

    // ── Inicio ────────────────────────────────────────────────────────────

    // Abre el stream — el evento 'connected' del servidor cargará el gantt inicial
    log(`Abriendo stream para el vuelo: ${activeFlightId}`);
    connect();

    return teardown;

    // Se re-ejecuta el efecto completo (cierra el stream viejo, abre uno nuevo) al cambiar el vuelo
  }, [activeFlightId, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
}
