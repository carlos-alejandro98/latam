import { scaleLinear } from '@visx/scale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FlightGanttTask } from '@/domain/entities/flight-gantt';
import { Text } from '@/presentation/components/design-system';
import { useSecondTimestamp } from '@/presentation/hooks/use-second-timestamp';

import { FlightGanttTimelineAxis } from './flight-gantt-timeline-axis';
import { FlightGanttTimelineRow } from './flight-gantt-timeline-row';
import {
  HEADER_ROW_HEIGHT,
  START_COLUMN_WIDTH,
  styles,
} from './flight-gantt-timeline.styles';
import {
  buildTimelineDomain,
  buildTimelineMarkers,
  buildTimelineRows,
  buildTimelineTicks,
  DEFAULT_TIMELINE_ZOOM_LEVEL,
  formatCurrentClockTime,
  getCurrentRelativeMinute,
  getTimelineWidth,
  TIMELINE_ZOOM_LEVELS,
} from './flight-gantt-timeline.utils';

import type { TimelineTaskRowData } from './flight-gantt-timeline.types';
import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';

export type FlightGanttTimelineProps = {
  staDate?: string | null;
  staTime?: string | null;
  etaDate?: string | null;
  etaTime?: string | null;
  stdDate?: string | null;
  stdTime?: string | null;
  etdDate?: string | null;
  etdTime?: string | null;
  pushOutTime?: string | null;
  tatVueloMinutos?: number | null;
  tasks: FlightGanttTask[];
  onRowClick?: (rowData: TimelineTaskRowData) => void;
};

interface VerticalScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

const HORIZONTAL_SCROLL_EXTRA_WIDTH = 320;
const LAST_ZOOM_LEVEL_INDEX = TIMELINE_ZOOM_LEVELS.length - 1;
const DEFAULT_ZOOM_LEVEL_INDEX = Math.max(
  0,
  TIMELINE_ZOOM_LEVELS.findIndex(
    (zoomLevel) => zoomLevel.id === DEFAULT_TIMELINE_ZOOM_LEVEL.id,
  ),
);

const formatZoomStepLabel = (tickStepMinutes: number): string => {
  return `/${String(tickStepMinutes).padStart(2, '0')}'`;
};

const buildTimelineRowsView = (
  rows: TimelineTaskRowData[],
  markers: ReturnType<typeof buildTimelineMarkers>,
  ticks: number[],
  stdMinute: number | null,
  timelineOffset: number,
  timelineViewportWidth: number,
  timelineWidth: number,
  xScale: (value: number) => number,
  onRowClick?: (rowData: TimelineTaskRowData) => void,
): ReactNode[] => {
  const nodes: ReactNode[] = [];
  for (const [index, rowData] of rows.entries()) {
    nodes.push(
      <FlightGanttTimelineRow
        key={`${rowData.task.taskId}-${index}`}
        index={index}
        markers={markers}
        rowData={rowData}
        ticks={ticks}
        stdMinute={stdMinute}
        timelineOffset={timelineOffset}
        timelineViewportWidth={timelineViewportWidth}
        timelineWidth={timelineWidth}
        xScale={xScale}
        onRowClick={onRowClick}
      />,
    );
  }

  return nodes;
};

/**
 * Central gantt timeline for calculated vs real task execution.
 */
export const FlightGanttTimeline = ({
  staDate,
  staTime,
  etaDate,
  etaTime,
  stdDate,
  stdTime,
  etdDate,
  etdTime,
  tatVueloMinutos,
  tasks,
  onRowClick,
}: FlightGanttTimelineProps): ReactNode => {
  // Diagnóstico: loguear cambios en tasks
  useEffect(() => {
    console.log(
      `[GanttTimeline] 📋 tasks actualizado — cantidad: ${tasks.length}` +
      (tasks.length === 0
        ? ' ⚠️  (SIN TAREAS — la gantt aparecerá vacía)'
        : ` | primera: "${tasks[0]?.taskName ?? 'N/A'}" | última: "${tasks[tasks.length - 1]?.taskName ?? 'N/A'}"`),
    );
    if (tasks.length > 0) {
      const withScheduled = tasks.filter((t) => t.inicioProgramado !== null).length;
      const withReal = tasks.filter((t) => t.inicioReal !== null).length;
      console.log(
        `[GanttTimeline]   ↳ con inicioProgramado: ${withScheduled}/${tasks.length} | con inicioReal: ${withReal}/${tasks.length}`,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Stable ref so rows always call the latest onRowClick without stale closures
  const onRowClickRef = useRef(onRowClick);
  onRowClickRef.current = onRowClick;
  const stableOnRowClick = useCallback((rowData: TimelineTaskRowData) => {
    onRowClickRef.current?.(rowData);
  }, []);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const topHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const verticalScrollRef = useRef<HTMLDivElement | null>(null);
  const verticalScrollContentRef = useRef<HTMLDivElement | null>(null);
  const pendingHorizontalAutoScrollRef = useRef(true);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [timelineOffset, setTimelineOffset] = useState(0);
  const [zoomLevelIndex, setZoomLevelIndex] = useState(
    DEFAULT_ZOOM_LEVEL_INDEX,
  );
  // Use second-level precision so the "now" bar advances smoothly in real time.
  const nowTimestamp = useSecondTimestamp();
  const [verticalScrollMetrics, setVerticalScrollMetrics] =
    useState<VerticalScrollMetrics>({
      clientHeight: 0,
      scrollHeight: 0,
      scrollTop: 0,
    });

  const zoomLevel =
    TIMELINE_ZOOM_LEVELS[zoomLevelIndex] ?? DEFAULT_TIMELINE_ZOOM_LEVEL;
  const isZoomOutDisabled = zoomLevelIndex <= 0;
  const isZoomInDisabled = zoomLevelIndex >= LAST_ZOOM_LEVEL_INDEX;

  const handleZoomOut = (): void => {
    if (isZoomOutDisabled) {
      return;
    }

    pendingHorizontalAutoScrollRef.current = true;
    setZoomLevelIndex((currentLevelIndex) => {
      return Math.max(0, currentLevelIndex - 1);
    });
  };

  const handleZoomIn = (): void => {
    if (isZoomInDisabled) {
      return;
    }

    pendingHorizontalAutoScrollRef.current = true;
    setZoomLevelIndex((currentLevelIndex) => {
      return Math.min(LAST_ZOOM_LEVEL_INDEX, currentLevelIndex + 1);
    });
  };

  // Native (non-passive) wheel handler — must be registered via addEventListener
  // so that preventDefault() is honoured by the browser (React synthetic events
  // are passive by default in modern browsers and cannot block navigation swipes).
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleWheel = (event: globalThis.WheelEvent): void => {
      const horizontalContainer = topHorizontalScrollRef.current;
      const verticalContainer = verticalScrollRef.current;
      if (!horizontalContainer || !verticalContainer) return;

      // Always prevent default to stop the browser back/forward swipe gesture
      event.preventDefault();

      if (event.shiftKey) {
        const horizontalDelta = event.deltaY || event.deltaX;
        if (horizontalDelta !== 0) {
          horizontalContainer.scrollLeft += horizontalDelta;
        }
        return;
      }

      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        if (event.deltaX !== 0) {
          horizontalContainer.scrollLeft += event.deltaX;
        }
        return;
      }

      if (event.deltaY !== 0) {
        verticalContainer.scrollTop += event.deltaY;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const domain = useMemo(
    () =>
      buildTimelineDomain(
        tasks,
        nowTimestamp,
        staDate,
        staTime,
        etaDate,
        etaTime,
        stdDate,
        stdTime,
        etdDate,
        etdTime,
      ),
    [
      tasks,
      nowTimestamp,
      staDate,
      staTime,
      etaDate,
      etaTime,
      stdDate,
      stdTime,
      etdDate,
      etdTime,
    ],
  );

  const rows = useMemo(
    () =>
      buildTimelineRows(
        tasks,
        domain.timelineStartDateMs,
        domain.stdMinute,
        nowTimestamp,
      ),
    [tasks, domain.timelineStartDateMs, domain.stdMinute, nowTimestamp],
  );

  // Auto-scroll to the bottom of the vertical list whenever a new row is added.
  // Uses rAF so the DOM has finished painting and scrollHeight is up to date.
  const prevRowCountRef = useRef(rows.length);
  useEffect(() => {
    const prevCount = prevRowCountRef.current;
    prevRowCountRef.current = rows.length;

    // Only scroll down when a row was added (not on initial load or row removal)
    if (rows.length <= prevCount) return;

    const frameId = requestAnimationFrame(() => {
      const verticalContainer = verticalScrollRef.current;
      if (!verticalContainer) return;
      verticalContainer.scrollTo({ top: verticalContainer.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frameId);
  }, [rows.length]);

  // Auto-scroll horizontally once on first load and later only after explicit
  // zoom actions so the user keeps control during normal browsing.
  useEffect(() => {
    if (!pendingHorizontalAutoScrollRef.current) {
      return;
    }

    if (!rows.length || timelineViewportWidth <= 0) {
      return;
    }

    const scrollToInitialPosition = (): void => {
      const horizontalContainer = topHorizontalScrollRef.current;
      if (!horizontalContainer) {
        pendingHorizontalAutoScrollRef.current = false;
        return;
      }

      // Find the earliest startMinute across all rows
      const earliestMinute = rows.reduce<number>((min, row) => {
        const start = row.calculatedRange?.startMinute ?? row.realRange?.startMinute ?? null;
        return start !== null && start < min ? start : min;
      }, Infinity);

      if (!isFinite(earliestMinute)) {
        pendingHorizontalAutoScrollRef.current = false;
        return;
      }

      // Convert to pixel position and subtract a comfortable left padding (60px)
      const totalWidth = Math.max(
        getTimelineWidth(domain, zoomLevel.pixelsPerMinute),
        timelineViewportWidth + HORIZONTAL_SCROLL_EXTRA_WIDTH,
      );
      const scale = totalWidth / Math.max(1, domain.maxMinute - domain.minMinute);
      const pixelPosition = (earliestMinute - domain.minMinute) * scale;
      const targetScroll = Math.max(0, pixelPosition - 60);

      horizontalContainer.scrollTo({ left: targetScroll, behavior: 'smooth' });
      pendingHorizontalAutoScrollRef.current = false;
    };

    const frameId = requestAnimationFrame(scrollToInitialPosition);
    return () => cancelAnimationFrame(frameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, zoomLevelIndex, timelineViewportWidth]);

  useEffect(() => {
    const timelineViewport = timelineViewportRef.current;
    if (!timelineViewport || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextWidth = Math.floor(entry.contentRect.width);
      setTimelineViewportWidth((previousWidth) => {
        if (previousWidth === nextWidth) {
          return previousWidth;
        }

        return nextWidth;
      });
    });

    observer.observe(timelineViewport);
    return () => {
      observer.disconnect();
    };
  }, []);

  const syncVerticalScrollMetrics = (): void => {
    const verticalContainer = verticalScrollRef.current;
    if (!verticalContainer) {
      return;
    }

    const nextMetrics: VerticalScrollMetrics = {
      clientHeight: verticalContainer.clientHeight,
      scrollHeight: verticalContainer.scrollHeight,
      scrollTop: verticalContainer.scrollTop,
    };
    setVerticalScrollMetrics((previousMetrics) => {
      if (
        previousMetrics.clientHeight === nextMetrics.clientHeight &&
        previousMetrics.scrollHeight === nextMetrics.scrollHeight &&
        previousMetrics.scrollTop === nextMetrics.scrollTop
      ) {
        return previousMetrics;
      }

      return nextMetrics;
    });
  };

  useEffect(() => {
    const verticalContainer = verticalScrollRef.current;
    if (!verticalContainer || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncVerticalScrollMetrics();
    });
    observer.observe(verticalContainer);

    const verticalContent = verticalScrollContentRef.current;
    if (verticalContent) {
      observer.observe(verticalContent);
    }

    syncVerticalScrollMetrics();
    return () => {
      observer.disconnect();
    };
  }, []);

  const handleTopHorizontalScroll = (): void => {
    const horizontalContainer = topHorizontalScrollRef.current;
    if (!horizontalContainer) {
      return;
    }

    setTimelineOffset(horizontalContainer.scrollLeft);
  };

  const handleVerticalScroll = (): void => {
    syncVerticalScrollMetrics();
  };

  const markerReferenceDate = stdDate ?? etdDate;
  const markerReferenceTime = stdTime ?? etdTime;
  const markerReferenceLabel = stdDate && stdTime ? 'STD' : 'ETD';

  const currentRelativeMinute = useMemo(
    () =>
      getCurrentRelativeMinute(
        markerReferenceDate,
        markerReferenceTime,
        nowTimestamp,
      ),
    [markerReferenceDate, markerReferenceTime, nowTimestamp],
  );
  const currentMarkerLabel = useMemo(
    () => formatCurrentClockTime(nowTimestamp),
    [nowTimestamp],
  );
  const markers = useMemo(
    () =>
      buildTimelineMarkers(
        tatVueloMinutos,
        currentRelativeMinute,
        currentMarkerLabel,
        domain.stdMinute,
        markerReferenceLabel,
      ),
    [
      tatVueloMinutos,
      currentRelativeMinute,
      currentMarkerLabel,
      domain.stdMinute,
      markerReferenceLabel,
    ],
  );
  const ticks = useMemo(
    () => buildTimelineTicks(domain, zoomLevel.tickStepMinutes),
    [domain, zoomLevel.tickStepMinutes],
  );
  const availableTimelineWidth = Math.max(0, timelineViewportWidth);
  const timelineWidth = useMemo(() => {
    const minimumWidth = getTimelineWidth(domain, zoomLevel.pixelsPerMinute);
    return minimumWidth > availableTimelineWidth
      ? minimumWidth
      : availableTimelineWidth + HORIZONTAL_SCROLL_EXTRA_WIDTH;
  }, [domain, zoomLevel.pixelsPerMinute, availableTimelineWidth]);
  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [domain.minMinute, domain.maxMinute], range: [0, timelineWidth] }),
    [domain.minMinute, domain.maxMinute, timelineWidth],
  );
  const rowNodes = useMemo(
    () =>
      buildTimelineRowsView(
        rows,
        markers,
        ticks,
        domain.stdMinute,
        timelineOffset,
        availableTimelineWidth,
        timelineWidth,
        xScale,
        stableOnRowClick,
      ),
    [
      rows,
      markers,
      ticks,
      domain.stdMinute,
      timelineOffset,
      availableTimelineWidth,
      timelineWidth,
      xScale,
      stableOnRowClick,
    ],
  );
  const verticalScrollableDistance = Math.max(
    0,
    verticalScrollMetrics.scrollHeight - verticalScrollMetrics.clientHeight,
  );
  const leftScrollbarThumbHeight = verticalScrollableDistance
    ? Math.max(
        42,
        (verticalScrollMetrics.clientHeight /
          verticalScrollMetrics.scrollHeight) *
          verticalScrollMetrics.clientHeight,
      )
    : Math.max(42, verticalScrollMetrics.clientHeight - 6);
  const leftScrollbarTravel = Math.max(
    0,
    verticalScrollMetrics.clientHeight - leftScrollbarThumbHeight,
  );
  const leftScrollbarThumbTop = verticalScrollableDistance
    ? (verticalScrollMetrics.scrollTop / verticalScrollableDistance) *
      leftScrollbarTravel
    : 0;

  const handleLeftScrollbarTrackMouseDown = (
    event: ReactMouseEvent<HTMLDivElement>,
  ): void => {
    const verticalContainer = verticalScrollRef.current;
    if (!verticalContainer || verticalScrollableDistance <= 0) {
      return;
    }

    const trackRect = event.currentTarget.getBoundingClientRect();
    const clickOffsetY = event.clientY - trackRect.top;
    const nextThumbTop = Math.max(
      0,
      Math.min(
        leftScrollbarTravel,
        clickOffsetY - leftScrollbarThumbHeight / 2,
      ),
    );
    const scrollRatio =
      leftScrollbarTravel > 0 ? nextThumbTop / leftScrollbarTravel : 0;
    verticalContainer.scrollTop = scrollRatio * verticalScrollableDistance;
  };

  const handleLeftScrollbarThumbMouseDown = (
    event: ReactMouseEvent<HTMLDivElement>,
  ): void => {
    const verticalContainer = verticalScrollRef.current;
    if (!verticalContainer || verticalScrollableDistance <= 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startClientY = event.clientY;
    const startScrollTop = verticalContainer.scrollTop;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const deltaY = moveEvent.clientY - startClientY;
      const safeThumbTravel = leftScrollbarTravel > 0 ? leftScrollbarTravel : 1;
      const scrollDelta =
        (deltaY / safeThumbTravel) * verticalScrollableDistance;
      verticalContainer.scrollTop = startScrollTop + scrollDelta;
    };

    const handleMouseUp = (): void => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (!rows.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Red warning banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            backgroundColor: '#FBCBD8',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: '#FBCBD8',
            borderRadius: 8,
            margin: '12px 16px 0 16px',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              borderRadius: '50%',
              backgroundColor: '#D92B2B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 1,
            }}
          >
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✕</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Text variant="label-sm" style={{ color: '#303030', fontWeight: 700, marginBottom: 8 }}>
              Sem planejamento de TAT
            </Text>
            <Text variant="label-sm" style={{ color: '#303030', marginBottom: 4 }}>
              A Gantt deste voo não foi iniciada.
            </Text>
            <Text variant="label-sm" style={{ color: '#303030' }}>
              O monitoramento em tempo real está indisponível.
            </Text>
          </div>
        </div>

        {/* Cactus empty state illustration */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '48px 24px 56px',
            margin: '12px 16px',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: '#D9D9D9',
            borderRadius: 8,
          }}
        >
          <img
            src="/images/cactus-empty-state.png"
            alt="Sin planificación TAT"
            style={{ width: 200, height: 200, objectFit: 'contain' }}
          />
          <Text
            variant="heading-sm"
            style={{ fontWeight: 700, color: '#303030', textAlign: 'center' }}
          >
            Voo sem planejamento de TAT
          </Text>
          <Text
            variant="label-sm"
            style={{ color: '#66718A', textAlign: 'center' }}
          >
            Selecione otro voo.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div ref={tableContainerRef} style={styles.tableContainer}>
      <div style={styles.headerRow}>
        <div
          style={{
            ...styles.axisCell,
            ...styles.cellProcess,
            ...styles.headerCell,
            height: HEADER_ROW_HEIGHT,
          }}
        >
          <Text variant="label-sm">Proceso</Text>
        </div>
        <div
          style={{
            ...styles.axisCell,
            ...styles.cellTime,
            ...styles.headerCell,
            height: HEADER_ROW_HEIGHT,
            width: START_COLUMN_WIDTH,
          }}
        >
          <Text variant="label-sm" style={{ fontWeight: 700, lineHeight: 1.2 }}>Inicio</Text>
          <Text variant="label-xs" style={{ color: '#07605B', lineHeight: 1.2, marginTop: 2 }}>Real</Text>
        </div>
        <div
          style={{
            ...styles.axisCell,
            ...styles.cellTime,
            ...styles.headerCell,
            height: HEADER_ROW_HEIGHT,
          }}
        >
          <Text variant="label-sm" style={{ fontWeight: 700, lineHeight: 1.2 }}>Fin</Text>
          <Text variant="label-xs" style={{ color: '#07605B', lineHeight: 1.2, marginTop: 2 }}>Real</Text>
        </div>
        <div ref={timelineViewportRef} style={styles.timelineHeaderPane}>
          <div
            ref={topHorizontalScrollRef}
            style={styles.timelineTopScroll}
            onScroll={handleTopHorizontalScroll}
          >
            <div
              style={{ ...styles.timelineTopScrollTrack, width: timelineWidth }}
            />
          </div>
          <div style={styles.timelineViewport}>
            <div
              style={{
                ...styles.timelineTrack,
                transform: `translateX(-${timelineOffset}px)`,
                width: timelineWidth,
              }}
            >
              <FlightGanttTimelineAxis
                markers={markers}
                ticks={ticks}
                timelineStartDateMs={domain.timelineStartDateMs}
                timelineWidth={timelineWidth}
                xScale={xScale}
              />
            </div>
          </div>
        </div>
      </div>
      <div style={styles.verticalScrollClipContainer}>
        <div
          ref={verticalScrollRef}
          style={styles.verticalScrollContainer}
          onScroll={handleVerticalScroll}
        >
          <div
            ref={verticalScrollContentRef}
            style={styles.verticalScrollContent}
          >
            {rowNodes}
          </div>
        </div>
      </div>
      <div style={styles.leftScrollbarOverlay}>
        <div
          style={styles.leftScrollbarTrack}
          onMouseDown={handleLeftScrollbarTrackMouseDown}
        >
          <div
            style={{
              ...styles.leftScrollbarThumb,
              height: leftScrollbarThumbHeight,
              transform: `translateY(${leftScrollbarThumbTop}px)`,
            }}
            onMouseDown={handleLeftScrollbarThumbMouseDown}
          />
        </div>
      </div>
      <div style={styles.zoomControlsContainer}>
        <Text variant="label-md">Zoom</Text>
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={isZoomOutDisabled}
          style={{
            ...styles.zoomControlButton,
            ...(isZoomOutDisabled ? styles.zoomControlButtonDisabled : null),
          }}
        >
          -
        </button>
        <button
          type="button"
          disabled
          style={{
            ...styles.zoomControlButton,
            ...styles.zoomPercentageButton,
          }}
        >
          <Text variant="label-md">{zoomLevel.percentage}%</Text>
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={isZoomInDisabled}
          style={{
            ...styles.zoomControlButton,
            ...(isZoomInDisabled ? styles.zoomControlButtonDisabled : null),
          }}
        >
          +
        </button>
        <Text variant="label-sm" style={styles.zoomStepText}>
          {formatZoomStepLabel(zoomLevel.tickStepMinutes)}
        </Text>
      </div>
    </div>
  );
};
