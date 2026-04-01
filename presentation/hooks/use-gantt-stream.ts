import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import { ENV } from '@/config/environment';
import { axiosClient } from '@/infrastructure/api/axios-client';
import {
  fetchFlightGantt,
  updateGanttData,
} from '@/store/slices/flight-gantt-slice';
import type { AppDispatch } from '@/store';
import type { FlightGantt } from '@/domain/entities/flight-gantt';

const SSE_PATH = '/api/v1/tracking/active-flights/stream';
const INTERVAL_SECONDS = 5;
const HEARTBEAT_INTERVAL = 20;
/** Force reconnect if no SSE event received within this window */
const STALE_TIMEOUT_MS = 45_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/**
 * Connects to the active-flights SSE stream and keeps the gantt for the
 * active flight up-to-date without any loading flash.
 *
 * Lifecycle:
 * - Opens a new connection each time `activeFlightId` changes.
 * - Cleanly closes the previous connection before opening a new one.
 * - Reconnects with exponential backoff + jitter on error or stale timeout.
 * - Fully tears down on unmount.
 */
export function useGanttStream(
  activeFlightId: string | null | undefined,
): void {
  const dispatch = useDispatch<AppDispatch>();

  // Keep a stable mutable ref so event handlers always see the latest flightId
  const activeFlightIdRef = useRef<string | null | undefined>(activeFlightId);
  activeFlightIdRef.current = activeFlightId;

  useEffect(() => {
    if (!activeFlightId) return;

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
        es.close();
        es = null;
      }
    };

    const teardown = () => {
      mounted = false;
      clearReconnectTimer();
      clearStaleTimer();
      closeEs();
    };

    const resetStaleTimer = () => {
      clearStaleTimer();
      staleTimer = setTimeout(() => {
        if (!mounted) return;
        console.log('[GanttStream] Stale connection — reconnecting');
        scheduleReconnect();
      }, STALE_TIMEOUT_MS);
    };

    /** Silently push new gantt data into the store (no loading flash). */
    const applyGanttUpdate = (data: FlightGantt) => {
      if (mounted) dispatch(updateGanttData(data));
    };

    /** Re-fetch gantt for the active flight and push silently. */
    const reloadGantt = (flightId: string) => {
      dispatch(fetchFlightGantt(flightId))
        .unwrap()
        .then(applyGanttUpdate)
        .catch(() => {
          /* keep existing data on error */
        });
    };

    // ── Reconnect with exponential backoff + jitter ─────────────────────

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
        `[GanttStream] Reconnecting in ${Math.round(delay)}ms (attempt ${retryCount})`,
      );
      reconnectTimer = setTimeout(() => {
        if (mounted) connect(); // eslint-disable-line @typescript-eslint/no-use-before-define
      }, delay);
    };

    // ── SSE Connection ───────────────────────────────────────────────────

    const connect = () => {
      if (!mounted) return;
      closeEs();

      const baseUrl =
        ENV.flightsApiBaseUrl ??
        (ENV as Record<string, unknown>).apiBaseUrl ??
        '';
      const url = `${baseUrl}${SSE_PATH}?interval_seconds=${INTERVAL_SECONDS}&heartbeat_interval=${HEARTBEAT_INTERVAL}`;

      // EventSource does not support custom headers — append Bearer token as query param
      const authHeader = axiosClient.defaults.headers.common[
        'Authorization'
      ] as string | undefined;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;
      const finalUrl = token
        ? `${url}&token=${encodeURIComponent(token)}`
        : url;

      es = new EventSource(finalUrl);
      resetStaleTimer();

      es.addEventListener('connected', () => {
        if (!mounted) return;
        retryCount = 0;
        resetStaleTimer();
        const fid = activeFlightIdRef.current;
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
          if (payload.flightId === fid) reloadGantt(fid);
        } catch {
          // malformed payload — ignore
        }
      });

      es.addEventListener('flight_updated', handleNamedEvent);
      es.addEventListener('flight_added', handleNamedEvent);
      es.addEventListener('flight_removed', handleNamedEvent);

      es.addEventListener('heartbeat', (event: MessageEvent) => {
        if (!mounted) return;
        resetStaleTimer();
      });

      es.addEventListener('error', () => {
        if (!mounted) return;
        clearStaleTimer();
        closeEs();
        scheduleReconnect();
      });
    };

    // ── Boot ─────────────────────────────────────────────────────────────

    // Immediately load gantt for the newly selected flight, then open stream
    void dispatch(fetchFlightGantt(activeFlightId));
    connect();

    return teardown;

    // Re-run the entire effect (close old stream, open new one) on flightId change
  }, [activeFlightId, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
}
