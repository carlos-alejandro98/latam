import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Text } from '@/presentation/components/design-system';

import {
  CALCULATED_BAR_HEIGHT,
  REAL_BAR_HEIGHT,
  ROW_HEIGHT,
  START_COLUMN_WIDTH,
  TIME_COLUMN_WIDTH,
  styles,
} from './flight-gantt-timeline.styles';
import {
  formatAbsoluteMinute,
  formatGanttDateTime,
  getRealBarColor,
} from './flight-gantt-timeline.utils';

import type { TimelineTaskRowData } from './flight-gantt-timeline.types';
import type { TimelineMarker } from './flight-gantt-timeline.types';

const EXPECTED_BAR_COLOR = '#cfcfcf'; // always gray — status never changes this bar
const REAL_BAR_RED = '#C8001E'; // in progress but already beyond plan

const EXPECTED_BAR_HEIGHT = CALCULATED_BAR_HEIGHT;

type FlightGanttTimelineRowProps = {
  index: number;
  markers: TimelineMarker[];
  ticks: number[];
  stdMinute: number | null;
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
        strokeDasharray={marker.lineStyle === 'dashed' ? '4 4' : '0'}
        strokeWidth={1.8}
      />,
    );
  }

  return lines;
};

const MIN_WIDTH_FOR_LABEL = 28; // px — minimum bar width to show duration label
const BAR_EDGE_LABEL_COLOR = '#6f6f6f';
const BAR_EDGE_LABEL_FONT_SIZE = 10;
const BAR_EDGE_LABEL_OFFSET = 6;
const HITO_LABEL_POINT_OFFSET = 14;

const getRelativeMinuteFromStd = (
  absoluteMinute: number,
  stdMinute: number,
): number => {
  return Math.round(absoluteMinute - stdMinute);
};

const formatRelativeMinuteEdgeLabel = (
  absoluteMinute: number | null,
  stdMinute: number | null,
): string | null => {
  if (absoluteMinute === null || stdMinute === null) {
    return null;
  }

  return String(getRelativeMinuteFromStd(absoluteMinute, stdMinute));
};

const renderRangeEdgeLabels = (
  key: string,
  range: { endMinute: number; startMinute: number },
  stdMinute: number | null,
  xScale: (value: number) => number,
  y: number,
): ReactNode => {
  const startLabel = formatRelativeMinuteEdgeLabel(
    range.startMinute,
    stdMinute,
  );
  const endLabel = formatRelativeMinuteEdgeLabel(
    range.endMinute,
    stdMinute,
  );

  return (
    <g
      key={`${key}-edge-labels`}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {startLabel ? (
        <text
          x={xScale(range.startMinute) - BAR_EDGE_LABEL_OFFSET}
          y={y}
          fill={BAR_EDGE_LABEL_COLOR}
          fontFamily="Arial, sans-serif"
          fontSize={BAR_EDGE_LABEL_FONT_SIZE}
          textAnchor="end"
        >
          {startLabel}
        </text>
      ) : null}
      {endLabel ? (
        <text
          x={xScale(range.endMinute) + BAR_EDGE_LABEL_OFFSET}
          y={y}
          fill={BAR_EDGE_LABEL_COLOR}
          fontFamily="Arial, sans-serif"
          fontSize={BAR_EDGE_LABEL_FONT_SIZE}
          textAnchor="start"
        >
          {endLabel}
        </text>
      ) : null}
    </g>
  );
};

const renderPointMinuteLabel = (
  key: string,
  minute: number,
  stdMinute: number | null,
  xScale: (value: number) => number,
  y: number,
  side: 'left' | 'right' = 'left',
): ReactNode => {
  const label = formatRelativeMinuteEdgeLabel(minute, stdMinute);
  if (!label) {
    return null;
  }

  const pointX = Math.round(xScale(minute));

  return (
    <text
      key={`${key}-minute-label`}
      x={
        side === 'left'
          ? pointX - HITO_LABEL_POINT_OFFSET
          : pointX + HITO_LABEL_POINT_OFFSET
      }
      y={y}
      fill={BAR_EDGE_LABEL_COLOR}
      fontFamily="Arial, sans-serif"
      fontSize={BAR_EDGE_LABEL_FONT_SIZE}
      textAnchor={side === 'left' ? 'end' : 'start'}
      dominantBaseline="middle"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {label}
    </text>
  );
};

const renderRangeBar = (
  key: string,
  fill: string,
  height: number,
  range: { endMinute: number; startMinute: number },
  xScale: (value: number) => number,
  y: number,
  _animationKey?: string | number,
  _isInProgress?: boolean,
): ReactNode => {
  const x = xScale(range.startMinute);
  const width = Math.max(2, xScale(range.endMinute) - x);
  const durationMin = Math.round(range.endMinute - range.startMinute);
  const showLabel = width >= MIN_WIDTH_FOR_LABEL && durationMin > 0;

  return (
    <g key={key}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={3}
        ry={3}
      />
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

const HITO_SIZE = 34;
const HITO_COLOR_ORIGINAL = '#075F5B';
const HITO_COLOR_GRAY = '#b0b0b0';
const HITO_COLOR_RED = '#C8001E';
const HITO_COLOR_GREEN = '#075F5B';

const renderHitoMarker = (
  key: string,
  minute: number,
  xScale: (value: number) => number,
  tint: 'gray' | 'original' | 'red' | 'green',
): ReactNode => {
  // Snap the milestone marker to a whole pixel so it stays centered on the time grid.
  const cx = Math.round(xScale(minute));
  const topY = (ROW_HEIGHT - HITO_SIZE) / 2;
  const bottomY = topY + HITO_SIZE;
  const circleR = 5.375;
  const circleStroke = 2;
  const circleY = topY + HITO_SIZE / 2;
  const lineTopEnd = circleY - circleR - circleStroke / 2;
  const lineBottomStart = circleY + circleR + circleStroke / 2;
  const color =
    tint === 'gray'
      ? HITO_COLOR_GRAY
      : tint === 'red'
        ? HITO_COLOR_RED
        : tint === 'green'
          ? HITO_COLOR_GREEN
          : HITO_COLOR_ORIGINAL;

  return (
    <g key={key} style={{ pointerEvents: 'none' }}>
      <line
        x1={cx}
        y1={topY}
        x2={cx}
        y2={lineTopEnd}
        stroke={color}
        shapeRendering="crispEdges"
        strokeWidth={2}
      />
      <circle
        cx={cx}
        cy={circleY}
        r={circleR}
        fill={color}
        stroke={color}
        strokeWidth={circleStroke}
      />
      <line
        x1={cx}
        y1={lineBottomStart}
        x2={cx}
        y2={bottomY}
        stroke={color}
        shapeRendering="crispEdges"
        strokeWidth={2}
      />
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
    stdMinute,
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
    const realStart = useMemo(
      () => formatGanttDateTime(rowData.task.inicioReal),
      [rowData.task.inicioReal],
    );
    const realEnd = useMemo(
      () => formatGanttDateTime(rowData.task.finReal),
      [rowData.task.finReal],
    );

    // Early  = real start is strictly before calculated start (green)
    // Late   = real start is strictly after  calculated start (red)
    // On time = within ±0.5 min tolerance (green)
    const realStartEarly =
      realStartMinute !== null &&
      calculatedStart !== null &&
      realStartMinute < calculatedStart;
    const realStartLate =
      realStartMinute !== null &&
      calculatedStart !== null &&
      realStartMinute > calculatedStart + 0.5;
    const realStartOutOfRange = realStartLate;
    const realEndOutOfRange =
      realEndMinute !== null &&
      calculatedEnd !== null &&
      realEndMinute > calculatedEnd + 0.5;

    // Stack: expected bar on top, real bar below, both centered as a group
    const GAP = 4;
    const totalStack = EXPECTED_BAR_HEIGHT + GAP + REAL_BAR_HEIGHT;
    const stackTop = Math.floor((ROW_HEIGHT - totalStack) / 2);
    const expectedBarY = stackTop;
    const realBarY = stackTop + EXPECTED_BAR_HEIGHT + GAP;

    const calcDurationMin =
      calculatedStart !== null && calculatedEnd !== null
        ? Math.round(calculatedEnd - calculatedStart)
        : 0;

    // Memoize grid and marker lines — only recompute when ticks/markers/xScale change
    const gridLines = useMemo(
      () => buildGridLines(ticks, xScale),
      [ticks, xScale],
    );
    const markerLines = useMemo(
      () => buildMarkerLines(markers, xScale),
      [markers, xScale],
    );

    // Expected bar is always gray — no shimmer, no status color
    const expectedBarNode: ReactNode = useMemo(
      () =>
        rowData.calculatedRange ? (
          <g key="expected-group">
            {renderRangeBar(
              'calc',
              EXPECTED_BAR_COLOR,
              EXPECTED_BAR_HEIGHT,
              rowData.calculatedRange,
              xScale,
              expectedBarY,
              calcDurationMin,
            )}
          </g>
        ) : null,
      [rowData.calculatedRange, xScale, expectedBarY, calcDurationMin],
    );
    const expectedEdgeLabels = useMemo(
      () =>
        rowData.calculatedRange
          ? renderRangeEdgeLabels(
              'calc',
              rowData.calculatedRange,
              stdMinute,
              xScale,
              expectedBarY + EXPECTED_BAR_HEIGHT / 2 + 4,
            )
          : null,
      [rowData.calculatedRange, stdMinute, xScale, expectedBarY],
    );

    const isRealInProgress = !!rowData.realRange && !rowData.task.finReal;
    const shimmerGradId = `real-shimmer-${rowData.task.taskId}`;

    const realBar = useMemo(() => {
      if (!rowData.realRange) return null;
      const resolvedRealBarColor = getRealBarColor(rowData);
      const shouldShimmer = isRealInProgress;
      const shimmerHighlightColor =
        resolvedRealBarColor === REAL_BAR_RED ? '#F06A7D' : '#6B71D8';
      const color = shouldShimmer
        ? `url(#${shimmerGradId})`
        : resolvedRealBarColor;
      const bar = renderRangeBar(
        'real',
        color,
        REAL_BAR_HEIGHT,
        rowData.realRange,
        xScale,
        realBarY,
        `${realStartMinute}-${realEndMinute}`,
        shouldShimmer,
      );
      if (!shouldShimmer) return bar;
      return (
        <g key="real-group">
          <defs>
            <linearGradient
              id={shimmerGradId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop
                offset="0%"
                stopColor={resolvedRealBarColor}
                stopOpacity="1"
              >
                <animate
                  attributeName="offset"
                  values="-1;2"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop
                offset="30%"
                stopColor={shimmerHighlightColor}
                stopOpacity="1"
              >
                <animate
                  attributeName="offset"
                  values="-0.7;2.3"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop
                offset="60%"
                stopColor={resolvedRealBarColor}
                stopOpacity="1"
              >
                <animate
                  attributeName="offset"
                  values="-0.4;2.6"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </stop>
            </linearGradient>
          </defs>
          {bar}
        </g>
      );
    }, [
      rowData,
      isRealInProgress,
      shimmerGradId,
      xScale,
      realBarY,
      realStartMinute,
      realEndMinute,
    ]);
    const realEdgeLabels = useMemo(
      () =>
        rowData.realRange
          ? renderRangeEdgeLabels(
              'real',
              rowData.realRange,
              stdMinute,
              xScale,
              realBarY + REAL_BAR_HEIGHT / 2 + 4,
            )
          : null,
      [rowData.realRange, stdMinute, xScale, realBarY],
    );

    const isHito = rowData.task.tipoEvento.toUpperCase() === 'HITO';

    const hitoRealMinute = realStartMinute ?? realEndMinute;
    const hitoRealMatchesCalc =
      hitoRealMinute !== null &&
      calculatedEnd !== null &&
      Math.abs(hitoRealMinute - calculatedEnd) <= 0.5;

    const hitoCalculatedMarker = useMemo(() => {
      if (!isHito || calculatedEnd === null) return null;
      if (hitoRealMatchesCalc)
        return renderHitoMarker('hito-calc', calculatedEnd, xScale, 'green');
      return renderHitoMarker('hito-calc', calculatedEnd, xScale, 'gray');
    }, [isHito, calculatedEnd, hitoRealMatchesCalc, xScale]);

    const hitoRealMarker = useMemo(() => {
      if (!isHito || hitoRealMinute === null) return null;
      if (hitoRealMatchesCalc) return null;
      const isLate = calculatedEnd !== null && hitoRealMinute > calculatedEnd + 0.5;
      const tint = isLate ? 'red' : 'original';
      return renderHitoMarker('hito-real', hitoRealMinute, xScale, tint);
    }, [isHito, hitoRealMinute, calculatedEnd, hitoRealMatchesCalc, xScale]);
    const hitoCalculatedLabel = useMemo(() => {
      if (!isHito || calculatedEnd === null) return null;
      return renderPointMinuteLabel(
        'hito-calc',
        calculatedEnd,
        stdMinute,
        xScale,
        ROW_HEIGHT / 2,
        'left',
      );
    }, [isHito, calculatedEnd, stdMinute, xScale]);
    const hitoRealLabel = useMemo(() => {
      if (!isHito || hitoRealMinute === null) return null;
      return renderPointMinuteLabel(
        'hito-real',
        hitoRealMinute,
        stdMinute,
        xScale,
        ROW_HEIGHT / 2,
        'right',
      );
    }, [isHito, hitoRealMinute, stdMinute, xScale]);

    const hitoIsLate =
      isHito &&
      hitoRealMinute !== null &&
      calculatedEnd !== null &&
      hitoRealMinute > calculatedEnd + 0.5;
    const isDelayed = isHito
      ? hitoIsLate
      : realStartOutOfRange || realEndOutOfRange;

    const rowStyle: Record<string, string | number> = useMemo(
      () => ({
        ...styles.row,
        ...(isDelayed
          ? { backgroundColor: '#FEF2F2' }
          : (getRowBackground(index) ?? {})),
        ...(hovered ? { backgroundColor: '#E7E8FD', cursor: 'pointer' } : {}),
      }),
      [index, hovered, isDelayed],
    );

    const handleMouseEnter = useCallback(() => setHovered(true), []);
    const handleMouseLeave = useCallback(() => setHovered(false), []);
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onRowClick?.(rowData);
      },
      [onRowClick, rowData],
    );

    return (
      <div
        style={rowStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <div
          style={{
            ...styles.taskCell,
            ...styles.cellProcess,
            ...styles.processTaskCell,
          }}
        >
          <Text variant="label-sm" style={styles.taskNameText}>
            {rowData.task.taskName}
          </Text>
        </div>
        {rowData.task.tipoEvento.toUpperCase() === 'HITO' ? (
          /* HITO: single merged column showing calculatedEnd + inicioReal */
          <div
            style={{
              ...styles.taskCell,
              ...styles.cellTime,
              width: START_COLUMN_WIDTH + TIME_COLUMN_WIDTH,
            }}
          >
            <Text
              variant="label-sm"
              style={{ fontWeight: 600, lineHeight: 1.2 }}
            >
              {calculatedEnd !== null
                ? formatAbsoluteMinute(calculatedEnd)
                : '--'}
            </Text>
            <Text
              variant="label-xs"
              style={{
                color: realStart
                  ? hitoRealMinute !== null &&
                    calculatedEnd !== null &&
                    hitoRealMinute > calculatedEnd + 0.5
                    ? '#C8001E'
                    : '#07605B'
                  : '#b0b0b0',
                lineHeight: 1.2,
                marginTop: 2,
                fontWeight:
                  realStart &&
                  hitoRealMinute !== null &&
                  calculatedEnd !== null &&
                  hitoRealMinute > calculatedEnd + 0.5
                    ? 700
                    : 400,
              }}
            >
              {realStart ?? '--'}
            </Text>
          </div>
        ) : (
          <>
            {/* Start column: estimated (fixed) on top, real (live) below */}
            <div
              style={{
                ...styles.taskCell,
                ...styles.cellTime,
                width: START_COLUMN_WIDTH,
              }}
            >
              <Text
                variant="label-sm"
                style={{ fontWeight: 600, lineHeight: 1.2 }}
              >
                {calculatedStart !== null
                  ? formatAbsoluteMinute(calculatedStart)
                  : '--'}
              </Text>
              <Text
                variant="label-xs"
                style={{
                  color: realStart
                    ? realStartOutOfRange && !realStartEarly
                      ? '#C8001E'
                      : '#07605B'
                    : '#b0b0b0',
                  lineHeight: 1.2,
                  marginTop: 2,
                  fontWeight:
                    realStartOutOfRange && !realStartEarly ? 700 : 400,
                }}
              >
                {realStart ?? '--'}
              </Text>
            </div>

            {/* End column: estimated (fixed) on top, real (live) below */}
            <div style={{ ...styles.taskCell, ...styles.cellTime }}>
              <Text
                variant="label-sm"
                style={{ fontWeight: 600, lineHeight: 1.2 }}
              >
                {calculatedEnd !== null
                  ? formatAbsoluteMinute(calculatedEnd)
                  : '--'}
              </Text>
              <Text
                variant="label-xs"
                style={{
                  color: realEnd
                    ? realEndOutOfRange
                      ? '#C8001E'
                      : '#07605B'
                    : '#b0b0b0',
                  lineHeight: 1.2,
                  marginTop: 2,
                  fontWeight: realEndOutOfRange ? 700 : 400,
                }}
              >
                {realEnd ?? '--'}
              </Text>
            </div>
          </>
        )}
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
              {isHito ? (
                <>
                  {hitoCalculatedMarker}
                  {hitoRealMarker}
                </>
              ) : (
                <>
                  {expectedBarNode}
                  {realBar}
                </>
              )}
              {markerLines}
              {isHito ? (
                <>
                  {hitoCalculatedLabel}
                  {hitoRealLabel}
                </>
              ) : (
                <>
                  {expectedEdgeLabels}
                  {realEdgeLabels}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>
    );
  },
);

FlightGanttTimelineRow.displayName = 'FlightGanttTimelineRow';
