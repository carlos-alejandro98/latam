import React, { memo, useCallback, useMemo, useState, type ReactNode } from "react";

import { Text } from "@/presentation/components/design-system";

import {
  CALCULATED_BAR_HEIGHT,
  REAL_BAR_HEIGHT,
  ROW_HEIGHT,
  START_COLUMN_WIDTH,
  styles,
} from "./flight-gantt-timeline.styles";
import {
  formatAbsoluteMinute,
  formatGanttDateTime,
  getRealBarColor,
} from "./flight-gantt-timeline.utils";

import type { TimelineTaskRowData } from "./flight-gantt-timeline.types";

const EXPECTED_BAR_COLOR = "#cfcfcf"; // always gray — status never changes this bar
const REAL_BAR_BLUE  = "#2C31C9";     // in progress (no finReal yet)
const REAL_BAR_RED   = "#C8001E";     // in progress but already beyond plan

import type { TimelineMarker } from "./flight-gantt-timeline.types";

const EXPECTED_BAR_HEIGHT = CALCULATED_BAR_HEIGHT;

type FlightGanttTimelineRowProps = {
  index: number;
  markers: TimelineMarker[];
  ticks: number[];
  timelineOffset: number;
  timelineViewportWidth: number;
  timelineWidth: number;
  xScale: (value: number) => number;
  rowData: TimelineTaskRowData;
  onRowClick?: (rowData: TimelineTaskRowData) => void;
};

const buildGridLines = (
  ticks: number[],
  xScale: (value: number) => number,
): ReactNode[] => {
  const lines: ReactNode[] = [];
  for (const tick of ticks) {
    const x = xScale(tick);
    lines.push(
      <line
        key={`grid-${tick}`}
        x1={x}
        x2={x}
        y1={0}
        y2={ROW_HEIGHT}
        stroke="#ececec"
        strokeWidth={1}
      />,
    );
  }

  return lines;
};

const buildMarkerLines = (
  markers: TimelineMarker[],
  xScale: (value: number) => number,
): ReactNode[] => {
  const lines: ReactNode[] = [];
  for (const marker of markers) {
    lines.push(
      <line
        key={`marker-${marker.id}`}
        x1={xScale(marker.minute)}
        x2={xScale(marker.minute)}
        y1={0}
        y2={ROW_HEIGHT}
        stroke={marker.color}
        strokeDasharray={marker.lineStyle === "dashed" ? "4 4" : "0"}
        strokeWidth={1.8}
      />,
    );
  }

  return lines;
};

const MIN_WIDTH_FOR_LABEL = 28; // px — minimum bar width to show duration label

const renderRangeBar = (
  key: string,
  fill: string,
  height: number,
  range: { endMinute: number; startMinute: number },
  xScale: (value: number) => number,
  y: number,
  animationKey?: string | number,
  isInProgress?: boolean,
): ReactNode => {
  const x = xScale(range.startMinute);
  const width = Math.max(2, xScale(range.endMinute) - x);
  const durationMin = Math.round(range.endMinute - range.startMinute);
  const showLabel = width >= MIN_WIDTH_FOR_LABEL && durationMin > 0;
  const animId = `bar-anim-${key}-${animationKey ?? 0}`;

  // In-progress bars grow 1px per second via CSS animation so the user
  // sees gradual progression instead of an instant full-width bar.
  // The "pixels per second" value is derived from the xScale resolution:
  // each minute = (xScale(1) - xScale(0)) pixels, so 1 second = that / 60.
  const pixelsPerSecond = (xScale(1) - xScale(0)) / 60;
  const animationStyle: React.CSSProperties = isInProgress
    ? {
        animationName: 'gantt-bar-grow',
        animationDuration: `${Math.max(1, Math.round(width / Math.max(0.001, pixelsPerSecond)))}s`,
        animationTimingFunction: 'linear',
        animationFillMode: 'forwards',
        animationIterationCount: '1',
        transformOrigin: `${x}px ${y}px`,
      }
    : {};

  return (
    <g key={key}>
      <defs>
        {isInProgress && (
          <style>{`
            @keyframes gantt-bar-grow {
              from { clip-path: inset(0 100% 0 0); }
              to   { clip-path: inset(0 0% 0 0); }
            }
          `}</style>
        )}
        <clipPath id={`clip-${animId}`}>
          <rect x={x} y={y} width={width} height={height} rx={3} ry={3} />
        </clipPath>
      </defs>
      {/* Bar rect — grows slowly when in-progress, instant when static */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={3}
        ry={3}
        clipPath={`url(#clip-${animId})`}
        style={isInProgress ? animationStyle : undefined}
      >
        {!isInProgress && (
          <animate
            attributeName="width"
            from="0"
            to={String(width)}
            dur="0.45s"
            begin="0s"
            fill="freeze"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.4 0 0.2 1"
          />
        )}
      </rect>
      {/* Duration label centered on the bar */}
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 4}
          textAnchor="middle"
          fontSize={9}
          fontWeight={700}
          fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {`${durationMin}m`}
        </text>
      )}
    </g>
  );
};

const getRowBackground = (
  index: number,
): Record<string, string | number> | null => {
  if (index % 2 === 0) {
    return null;
  }

  return styles.rowAlternate;
};

/**
 * Render a single gantt timeline row with calculated and real task ranges.
 */
export const FlightGanttTimelineRow = memo(
  ({
    index,
    markers,
    rowData,
    ticks,
    timelineOffset,
    timelineViewportWidth,
    timelineWidth,
    xScale,
    onRowClick,
  }: FlightGanttTimelineRowProps): ReactNode => {
    const [hovered, setHovered] = useState(false);

    const calculatedStart = rowData.calculatedRange?.startMinute ?? null;
    const calculatedEnd = rowData.calculatedRange?.endMinute ?? null;
    const realStartMinute = rowData.realRange?.startMinute ?? null;
    const realEndMinute = rowData.realRange?.endMinute ?? null;

    // Real times from backend (inicioReal / finReal)
    const realStart = useMemo(() => formatGanttDateTime(rowData.task.inicioReal), [rowData.task.inicioReal]);
    const realEnd   = useMemo(() => formatGanttDateTime(rowData.task.finReal),   [rowData.task.finReal]);

    // Early  = real start is strictly before calculated start (green)
    // Late   = real start is strictly after  calculated start (red)
    // On time = within ±0.5 min tolerance (green)
    const realStartEarly = realStartMinute !== null && calculatedStart !== null && realStartMinute < calculatedStart;
    const realStartLate  = realStartMinute !== null && calculatedStart !== null && realStartMinute > calculatedStart + 0.5;
    const realStartOutOfRange = realStartLate;
    const realEndOutOfRange   = realEndMinute   !== null && calculatedEnd   !== null && realEndMinute   > calculatedEnd   + 0.5;

    // Stack: expected bar on top, real bar below, both centered as a group
    const GAP = 4;
    const totalStack = EXPECTED_BAR_HEIGHT + GAP + REAL_BAR_HEIGHT;
    const stackTop   = Math.floor((ROW_HEIGHT - totalStack) / 2);
    const expectedBarY = stackTop;
    const realBarY     = stackTop + EXPECTED_BAR_HEIGHT + GAP;

    const calcDurationMin = (calculatedStart !== null && calculatedEnd !== null)
      ? Math.round(calculatedEnd - calculatedStart) : 0;

    // Memoize grid and marker lines — only recompute when ticks/markers/xScale change
    const gridLines   = useMemo(() => buildGridLines(ticks, xScale),    [ticks, xScale]);
    const markerLines = useMemo(() => buildMarkerLines(markers, xScale), [markers, xScale]);

    // Expected bar is always gray — no shimmer, no status color
    const expectedBarNode: ReactNode = useMemo(() => rowData.calculatedRange
      ? <g key="expected-group">{renderRangeBar('calc', EXPECTED_BAR_COLOR, EXPECTED_BAR_HEIGHT, rowData.calculatedRange, xScale, expectedBarY, calcDurationMin)}</g>
      : null,
    [rowData.calculatedRange, xScale, expectedBarY, calcDurationMin]);

    const isRealInProgress = !!rowData.realRange && !rowData.task.finReal;
    const shimmerGradId = `real-shimmer-${rowData.task.taskId}`;

    const realBar = useMemo(() => {
      if (!rowData.realRange) return null;
      const resolvedRealBarColor = getRealBarColor(rowData);
      const shouldShimmer = isRealInProgress;
      const shimmerHighlightColor =
        resolvedRealBarColor === REAL_BAR_RED ? "#F06A7D" : "#6B71D8";
      const color = shouldShimmer
        ? `url(#${shimmerGradId})`
        : resolvedRealBarColor;
      const bar = renderRangeBar('real', color, REAL_BAR_HEIGHT, rowData.realRange, xScale, realBarY, `${realStartMinute}-${realEndMinute}`, shouldShimmer);
      if (!shouldShimmer) return bar;
      return (
        <g key="real-group">
          <defs>
            <linearGradient id={shimmerGradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={resolvedRealBarColor} stopOpacity="1">
                <animate attributeName="offset" values="-1;2" dur="1.6s" repeatCount="indefinite" />
              </stop>
              <stop offset="30%" stopColor={shimmerHighlightColor} stopOpacity="1">
                <animate attributeName="offset" values="-0.7;2.3" dur="1.6s" repeatCount="indefinite" />
              </stop>
              <stop offset="60%" stopColor={resolvedRealBarColor} stopOpacity="1">
                <animate attributeName="offset" values="-0.4;2.6" dur="1.6s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          {bar}
        </g>
      );
    }, [rowData, isRealInProgress, shimmerGradId, xScale, realBarY, realStartMinute, realEndMinute]);

    // Determinar si hay atraso en inicio o fin.
    // rowData.isDelayed viene del backend (task.estaRetrasada) y ya contempla
    // todos los casos — incluyendo cuando el vuelo es de otro día o cuando los
    // rangos calculados no están disponibles. La lógica local sirve como
    // complemento para detectar atrasos en tiempo real (barra en progreso).
    const isCompleted = !!rowData.task.finReal;
    const isDelayed =
      rowData.isDelayed ||
      (isCompleted && (realStartOutOfRange || realEndOutOfRange));

    const rowStyle: Record<string, string | number> = useMemo(() => ({
      ...styles.row,
      ...(getRowBackground(index) ?? {}),
      ...(hovered ? { backgroundColor: '#E7E8FD', cursor: 'pointer' } : {}),
    }), [index, hovered]);

    const handleMouseEnter = useCallback(() => setHovered(true),  []);
    const handleMouseLeave = useCallback(() => setHovered(false), []);
    const handleClick      = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      onRowClick?.(rowData);
    }, [onRowClick, rowData]);

    return (
      <div
        style={rowStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <div style={{ ...styles.taskCell, ...styles.cellProcess }}>
          <Text variant="label-sm" style={styles.taskNameText}>
            {rowData.task.taskName}
          </Text>
        </div>
        {/* Start column: estimated (fixed) on top, real (live) below */}
        <div
          style={{
            ...styles.taskCell,
            ...styles.cellTime,
            width: START_COLUMN_WIDTH,
            ...((realStartOutOfRange || rowData.isDelayed) && !realStartEarly && realStart
              ? { backgroundColor: '#FEF2F2' }
              : {}),
          }}
        >
          <Text variant="label-sm" style={{ fontWeight: 600, lineHeight: 1.2 }}>
            {calculatedStart !== null ? formatAbsoluteMinute(calculatedStart) : '--'}
          </Text>
          <Text
            variant="label-xs"
            style={{
              color: realStart
                ? (realStartOutOfRange || rowData.isDelayed) && !realStartEarly
                  ? '#C8001E'
                  : '#07605B'
                : '#b0b0b0',
              lineHeight: 1.2,
              marginTop: 2,
              fontWeight: (realStartOutOfRange || rowData.isDelayed) && !realStartEarly ? 700 : 400,
            }}
          >
            {realStart ?? '--'}
          </Text>
        </div>

        {/* End column: estimated (fixed) on top, real (live) below */}
        <div style={{
          ...styles.taskCell,
          ...styles.cellTime,
          ...((realEndOutOfRange || rowData.isDelayed) && realEnd
            ? { backgroundColor: '#FEF2F2' }
            : {}),
        }}>
          <Text variant="label-sm" style={{ fontWeight: 600, lineHeight: 1.2 }}>
            {calculatedEnd !== null ? formatAbsoluteMinute(calculatedEnd) : '--'}
          </Text>
          <Text
            variant="label-xs"
            style={{
              color: realEnd
                ? (realEndOutOfRange || rowData.isDelayed) ? '#C8001E' : '#07605B'
                : '#b0b0b0',
              lineHeight: 1.2,
              marginTop: 2,
              fontWeight: (realEndOutOfRange || rowData.isDelayed) ? 700 : 400,
            }}
          >
            {realEnd ?? '--'}
          </Text>
        </div>
        <div style={{ ...styles.timelineCell, width: timelineViewportWidth }}>
          <div
            style={{
              ...styles.timelineTrack,
              transform: `translateX(-${timelineOffset}px)`,
              width: timelineWidth,
            }}
          >
            <svg width={timelineWidth} height={ROW_HEIGHT}>
              {gridLines}
              {expectedBarNode}
              {realBar}
              {markerLines}
            </svg>
          </div>
        </div>
      </div>
    );
  },
);

FlightGanttTimelineRow.displayName = "FlightGanttTimelineRow";
