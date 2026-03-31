import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import { ENV } from '@/config/environment';
import { container } from '@/dependencyInjection/container';
import { FlightsHttpClient } from '@/infrastructure/http/flights-http-client';
import type { AppDispatch } from '@/store';
import { updateGanttData } from '@/store/slices/flight-gantt-slice';

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
 * Tiempo de espera antes de ejecutar la recarga del gantt tras recibir un evento.
 * Colapsa múltiples eventos que lleguen en ráfaga en una sola llamada HTTP.
 */
const RELOAD_DEBOUNCE_MS = 400;

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
    let reloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
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

    const clearReloadDebounce = () => {
      if (reloadDebounceTimer) {
        clearTimeout(reloadDebounceTimer);
        reloadDebounceTimer = null;
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
      clearReloadDebounce();
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
     * Recarga el gantt del vuelo activo llamando directamente al use case
     * y despachando updateGanttData — sin activar loading:true en el store,
     * evitando así que el componente gantt parpadee o se desmonte durante la actualización.
     */
    const reloadGantt = (flightId: string) => {
      log(`► RECARGANDO gantt del vuelo: ${flightId}`);
      container.getFlightGanttUseCase
        .execute(flightId)
        .then((data) => {
          if (!mounted) {
            log(`✗ Respuesta descartada — componente desmontado (vuelo: ${flightId})`);
            return;
          }
          log(`✓ Gantt recibido: ${data.tasks.length} tareas | flight.flightId en respuesta: ${data.flight?.flightId ?? 'N/A'}`);
          dispatch(updateGanttData(data));
          log(`✓ updateGanttData despachado al store — la gantt debería re-renderizarse`);
        })
        .catch((err: unknown) => {
          logError(`✗ Error HTTP al recargar gantt del vuelo ${flightId}:`, err);
        });
    };

    /**
     * Versión con debounce de reloadGantt.
     * Si llegan múltiples eventos seguidos (ráfaga al conectarse), colapsa
     * todas las llamadas en una sola que se ejecuta tras RELOAD_DEBOUNCE_MS.
     */
    const scheduleReload = (flightId: string, reason: string) => {
      clearReloadDebounce();
      log(`⏳ Recarga programada en ${RELOAD_DEBOUNCE_MS}ms por evento '${reason}' (vuelo activo: ${flightId})`);
      reloadDebounceTimer = setTimeout(() => {
        if (!mounted) return;
        reloadGantt(flightId);
      }, RELOAD_DEBOUNCE_MS);
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

    // ── Extrae el flightId del payload de un evento SSE ──────────────────

    const extractFlightId = (raw: string): string | undefined => {
      try {
        const payload = JSON.parse(raw) as Record<string, unknown>;
        return (
          (payload.flightId as string | undefined) ??
          (payload.flight_id as string | undefined) ??
          (payload.id as string | undefined)
        );
      } catch {
        return undefined;
      }
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
      log(`◎ EventSource creado — readyState: ${es.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
      resetStaleTimer();

      es.onopen = () => {
        log(`◎ EventSource.onopen — conexión abierta. readyState: ${es?.readyState}`);
      };

      // Listener genérico: captura TODOS los eventos SSE sin importar su nombre.
      // Esto es necesario porque el EventSource de los navegadores solo dispara
      // addEventListener('nombre') si el servidor envía exactamente "event: nombre".
      // Con el listener de 'message' atrapamos cualquier evento que use "data:" sin "event:".
      es.addEventListener('message', (event: MessageEvent) => {
        if (!mounted) return;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        log(`◉ Evento 'message' — lastEventId: "${event.lastEventId}" | data: ${String(event.data).slice(0, 200)}`);
        if (!fid) {
          log(`  → Sin vuelo activo, evento ignorado`);
          return;
        }
        scheduleReload(fid, 'message');
      });

      es.addEventListener('connected', (event: MessageEvent) => {
        if (!mounted) return;
        retryCount = 0;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        log(`◉ Evento 'connected' — data: ${String(event.data).slice(0, 200)}`);
        log(`  → Cargando gantt inicial del vuelo: ${fid ?? 'ninguno'}`);
        if (fid) reloadGantt(fid);
      });

      // Listeners nombrados — se mantienen para los servidores que sí envían "event: flight_added", etc.
      const handleNamedEvent = (event: MessageEvent) => {
        if (!mounted) return;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
        log(`◉ Evento nombrado '${event.type}' — lastEventId: "${event.lastEventId}" | data: ${String(event.data).slice(0, 200)}`);
        if (!fid) {
          log(`  → Sin vuelo activo, evento ignorado`);
          return;
        }
        scheduleReload(fid, event.type);
      };

      es.addEventListener('flight_updated', handleNamedEvent);
      es.addEventListener('flight_added', handleNamedEvent);
      es.addEventListener('flight_removed', handleNamedEvent);

      es.addEventListener('heartbeat', (event: MessageEvent) => {
        if (!mounted) return;
        log(`♡ Heartbeat recibido — data: ${String(event.data).slice(0, 80)}`);
        resetStaleTimer();
      });

      es.addEventListener('error', (event) => {
        if (!mounted) return;
        logError(`✗ Error en la conexión SSE — readyState: ${es?.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`, event);
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
