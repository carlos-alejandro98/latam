import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import { ENV } from '@/config/environment';
import { FlightsHttpClient } from '@/infrastructure/http/flights-http-client';
import {
  fetchFlightGantt,
  updateGanttData,
} from '@/store/slices/flight-gantt-slice';
import type { AppDispatch } from '@/store';
import type { FlightGantt } from '@/domain/entities/flight-gantt';

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
      console.log('[GanttStream] No hay vuelo activo seleccionado, no se abre el stream.');
      return;
    }

    console.log(`[GanttStream] Iniciando stream para el vuelo: ${activeFlightId}`);

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
        console.log('[GanttStream] Cerrando conexión SSE existente.');
        es.close();
        es = null;
      }
    };

    const teardown = () => {
      console.log(`[GanttStream] Destruyendo stream del vuelo: ${activeFlightId}`);
      mounted = false;
      clearReconnectTimer();
      clearStaleTimer();
      closeEs();
    };

    const resetStaleTimer = () => {
      clearStaleTimer();
      staleTimer = setTimeout(() => {
        if (!mounted) return;
        console.warn('[GanttStream] La conexión lleva demasiado tiempo sin recibir eventos. Reconectando...');
        scheduleReconnect();
      }, STALE_TIMEOUT_MS);
    };

    /** Actualiza el store con datos nuevos sin activar el estado de carga. */
    const applyGanttUpdate = (data: FlightGantt) => {
      if (mounted) {
        console.log(`[GanttStream] Aplicando actualización silenciosa del gantt para el vuelo: ${data.flight?.flightId ?? 'desconocido'}`);
        dispatch(updateGanttData(data));
      }
    };

    /** Re-fetchea el gantt del vuelo activo y lo empuja al store silenciosamente. */
    const reloadGantt = (flightId: string) => {
      console.log(`[GanttStream] Recargando datos del gantt para el vuelo: ${flightId}`);
      dispatch(fetchFlightGantt(flightId))
        .unwrap()
        .then(applyGanttUpdate)
        .catch((err: unknown) => {
          console.error(`[GanttStream] Error al recargar el gantt del vuelo ${flightId}:`, err);
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
      console.log(
        `[GanttStream] Reconectando en ${Math.round(delay)}ms (intento #${retryCount})`,
      );
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
        console.warn('[GanttStream] No se encontró token de autenticación. El stream puede ser rechazado por el servidor.');
      }

      const finalUrl = token
        ? `${url}&token=${encodeURIComponent(token)}`
        : url;

      console.log(`[GanttStream] Abriendo conexión SSE → ${baseUrl}${SSE_PATH} | token presente: ${!!token}`);

      es = new EventSource(finalUrl);
      resetStaleTimer();

      es.addEventListener('connected', () => {
        if (!mounted) return;
        retryCount = 0;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        console.log(`[GanttStream] Conexión establecida con el servidor. Cargando gantt del vuelo: ${fid ?? 'ninguno'}`);
        if (fid) void dispatch(fetchFlightGantt(fid));
      });

      es.addEventListener('flight_updated', (event: MessageEvent) => {
        if (!mounted) return;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        if (!fid) return;
        try {
          const payload = JSON.parse(event.data as string) as {
            flightId?: string;
          };
          console.log(`[GanttStream] Evento 'flight_updated' recibido. flightId del evento: ${payload.flightId ?? 'no especificado'}, vuelo activo: ${fid}`);
          if (payload.flightId === fid) {
            console.log(`[GanttStream] El vuelo actualizado coincide con el activo. Recargando gantt...`);
            reloadGantt(fid);
          } else {
            console.log(`[GanttStream] El vuelo actualizado (${payload.flightId}) no es el activo (${fid}). Se ignora.`);
          }
        } catch {
          console.warn('[GanttStream] Se recibió un evento flight_updated con payload malformado. Se ignora.');
        }
      });

      es.addEventListener('flight_added', () => {
        if (!mounted) return;
        console.log('[GanttStream] Evento flight_added recibido. Manteniendo timer de actividad.');
        resetStaleTimer();
      });

      es.addEventListener('flight_removed', () => {
        if (!mounted) return;
        console.log('[GanttStream] Evento flight_removed recibido. Manteniendo timer de actividad.');
        resetStaleTimer();
      });

      es.addEventListener('heartbeat', () => {
        if (!mounted) return;
        console.log('[GanttStream] Heartbeat recibido. Conexión activa.');
        resetStaleTimer();
      });

      es.addEventListener('error', (event) => {
        if (!mounted) return;
        console.error('[GanttStream] Error en la conexión SSE. Se intentará reconectar.', event);
        clearStaleTimer();
        closeEs();
        scheduleReconnect();
      });
    };

    // ── Inicio ────────────────────────────────────────────────────────────

    // Carga el gantt inmediatamente para el vuelo seleccionado, luego abre el stream
    console.log(`[GanttStream] Cargando gantt inicial del vuelo: ${activeFlightId}`);
    void dispatch(fetchFlightGantt(activeFlightId));
    connect();

    return teardown;

    // Se re-ejecuta el efecto completo (cierra el stream viejo, abre uno nuevo) al cambiar el vuelo
  }, [activeFlightId, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
}
