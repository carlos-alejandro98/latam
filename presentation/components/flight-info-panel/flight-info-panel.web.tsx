/* eslint-disable max-lines */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable max-lines-per-function */

import { SeatEconomy } from '@hangar/react-icons/core/latam/Seat/SeatEconomy';
import { useRef, useState, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import styled, { useTheme } from 'styled-components';

import {
  FlightLanding,
  FlightTakeOff,
} from '@/presentation/components/common/icons';
import {
  Box,
  Spinner,
  Tag,
  Text,
} from '@/presentation/components/design-system';
import { FlightGanttTimeline } from '@/presentation/components/flight-gantt-timeline';
import { useSecondTimestamp } from '@/presentation/hooks/use-second-timestamp';
import {
  resolveFrozenPushOutDelaySeconds,
  resolveSecondsToAvailableEnd,
} from '@/presentation/view-models/flight-available-time';

import { FlightInfoEventsPanel } from './flight-info-events-panel';
import { styles } from './flight-info-panel.styles.web';

import type { FlightInfoPanelProps } from './flight-info-panel.types';

// No JS breakpoint needed — layout is driven purely by CSS flex-wrap.
// Cards have a min-width of 280px; when the container is too narrow they
// wrap naturally. The ResizeObserver is no longer used.

// --- Styled components ---

type PanelColors = {
  borderPrimary: string;
  interactionSoftDefault: string;
  surfaceSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  surfacePrimary: string;
  surfaceTagNeutral: string;
};

type InfoItemProps = {
  label: string;
  value: string;
};

const getPanelColors = (theme: ReturnType<typeof useTheme>): PanelColors => {
  return {
    borderPrimary: theme?.tokens?.color?.border?.primary ?? '#d9d9d9',
    interactionSoftDefault:
      theme?.tokens?.color?.interaction?.softDefault ?? '#2c31c9',
    surfaceSecondary: theme?.tokens?.color?.surface?.secondary ?? '#f2f2f2',
    textPrimary: theme?.tokens?.color?.text?.primary ?? '#3a3a3a',
    textSecondary: theme?.tokens?.color?.text?.secondary ?? '#626262',
    textTertiary: theme?.tokens?.color?.text?.tertiary ?? '#070b64',
    surfacePrimary: theme?.tokens?.color?.surface?.primary ?? '#ffffff',
    surfaceTagNeutral: theme?.tokens?.color?.neutral?.[200] ?? '#d9d9d9',
  };
};

const InfoItem = ({ label, value }: InfoItemProps) => {
  return (
    <Box style={styles.infoItem}>
      <Text variant="label-xs" color="secondary">
        {label}
      </Text>
      <Text variant="label-xs">{value}</Text>
    </Box>
  );
};

const StatusTag = styled(Tag)`
  svg {
    display: none;
  }
`;

// ─── Tempo Disponível — animated countdown ───────────────────────────────────
const tempoStyles = `
@keyframes _tdFade {
  from { opacity: 0.3; transform: translateY(-3px) scale(0.96); }
  to   { opacity: 1;   transform: translateY(0)    scale(1); }
}
@keyframes _tdPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}
._td-digit {
  display: inline-block;
  animation: _tdFade 0.2s ease-out forwards;
  will-change: transform, opacity;
}
._td-pulse {
  animation: _tdPulse 1.6s ease-in-out infinite;
}

/* Grid shared by Row 1 (header) and Row 2 (sub-bar) */
@media (max-width: 1237px) {
  .hcc-grid {
    grid-template-columns: 1fr !important;
  }
  .hcc-grid .hcc-card {
    border-right: none !important;
    border-bottom: 1px solid #D9D9D9;
  }
  .hcc-grid .hcc-midbox {
    flex-direction: row !important;
    gap: 12px !important;
    border-right: none !important;
    border-bottom: 1px solid #D9D9D9;
    width: 100%;
  }
  .hcc-grid .hcc-tempo {
    border-bottom: 1px solid #D9D9D9;
    width: 100%;
  }
  .hcc-subbar-cell {
    border-right: none !important;
    border-left: none !important;
  }
}
`;

const WARNING_SECONDS = 5 * 60;

/**
 * Computes seconds remaining until today's STD time.
 *
 * The countdown always uses TODAY's local date combined with the STD time
 * (HH:mm from stdTime). This is intentional: the operator sees "time left
 * until departure" relative to the current day — regardless of which date
 * the flight record was created on.
 *
 * Positive  = STD is still in the future → black countdown, decreasing.
 * Negative  = STD has passed today       → red, absolute value shown.
 */
/**
 * Formats absolute seconds as "HH:MM:SS" — no sign, always positive display.
 * The caller decides the color (red = overdue, black = remaining).
 */
const formatHHMMSS = (totalSeconds: number): string => {
  const abs = Math.abs(totalSeconds);
  const hh = Math.floor(abs / 3600);
  const mm = Math.floor((abs % 3600) / 60);
  const ss = abs % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

/** A single digit/char that re-animates only when its character changes. */
const AnimatedChar = ({ char, color }: { char: string; color: string }) => {
  const [key, setKey] = useState(0);
  const prev = useRef(char);
  useEffect(() => {
    if (char !== prev.current) {
      prev.current = char;
      setKey((k) => k + 1);
    }
  }, [char]);
  return (
    <span
      key={key}
      className="_td-digit"
      style={{
        color,
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-block',
        minWidth: char === ':' ? '0.3em' : '0.65em',
        textAlign: 'center',
      }}
    >
      {char}
    </span>
  );
};

type TempoDisponivelProps = {
  availableEndDate: string | null;
  availableEndTime: string | null;
  pushOutTime: string | null;
  allTasksCompleted: boolean;
};

const TempoDisponivelLive = ({
  availableEndDate,
  availableEndTime,
  pushOutTime,
  allTasksCompleted,
}: TempoDisponivelProps) => {
  const nowMs = useSecondTimestamp();
  const seconds = useMemo(
    () =>
      resolveSecondsToAvailableEnd({
        endDate: availableEndDate,
        endTime: availableEndTime,
        nowTimestamp: nowMs,
      }),
    [availableEndDate, availableEndTime, nowMs],
  );
  const pushOutDelaySeconds = useMemo(
    () =>
      resolveFrozenPushOutDelaySeconds({
        endDate: availableEndDate,
        endTime: availableEndTime,
        pushOut: pushOutTime,
      }),
    [availableEndDate, availableEndTime, pushOutTime],
  );

  const [completedFrozenSeconds, setCompletedFrozenSeconds] = useState<
    number | null
  >(null);
  useEffect(() => {
    if (pushOutDelaySeconds !== null) {
      if (completedFrozenSeconds !== null) {
        setCompletedFrozenSeconds(null);
      }
      return;
    }

    if (
      allTasksCompleted &&
      completedFrozenSeconds === null &&
      seconds !== null
    ) {
      setCompletedFrozenSeconds(seconds);
    }

    if (!allTasksCompleted && completedFrozenSeconds !== null) {
      setCompletedFrozenSeconds(null);
    }
  }, [
    allTasksCompleted,
    completedFrozenSeconds,
    pushOutDelaySeconds,
    seconds,
  ]);

  const displaySeconds = pushOutDelaySeconds ?? completedFrozenSeconds ?? seconds;

  if (displaySeconds === null) {
    return (
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.04em',
          fontFamily: 'monospace, Arial',
          color: '#3a3a3a',
        }}
      >
        --:--:--
      </span>
    );
  }

  const isRed = displaySeconds < 0;
  const isPulsing =
    pushOutDelaySeconds === null &&
    !allTasksCompleted &&
    displaySeconds >= 0 &&
    displaySeconds <= WARNING_SECONDS;
  const color = isRed ? '#C8001E' : '#3a3a3a';
  const label = formatHHMMSS(displaySeconds);

  return (
    <span
      className={isPulsing ? '_td-pulse' : undefined}
      style={{
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: '0.04em',
        fontFamily: 'monospace, Arial',
        display: 'inline-flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {label.split('').map((char, i) => (
        <AnimatedChar key={i} char={char} color={color} />
      ))}
    </span>
  );
};

export const FlightInfoPanel = ({
  viewModel,
  loading,
  error,
  onRowClick,
}: FlightInfoPanelProps) => {
  const theme = useTheme();
  const colors = getPanelColors(theme);

  // Observe the actual width of the center area to decide layout direction
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <Box style={styles.loadingWrapper}>
        <Box style={styles.loadingContent}>
          <Spinner size="normal" />
          <Text variant="label-sm" color="secondary">
            Cargando detalle del vuelo...
          </Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box style={styles.loadingWrapper}>
        <Box style={styles.loadingContent}>
          <Text variant="label-sm" color="secondary">
            No se pudo cargar el detalle del vuelo.
          </Text>
        </Box>
      </Box>
    );
  }

  if (!viewModel) {
    return null;
  }
  return (
    <Box style={styles.panelContainer}>
      <style>{tempoStyles}</style>
      <Box ref={wrapperRef} style={styles.mainContent}>
        {/* ── Top header bar ─────────────────────────────────────────────── */}
        <Box style={styles.wrapperSupScroll}>
          {/* Grid: 4 columnas compartidas por Row 1 y Row 2 */}
          <Box className="hcc-grid" style={styles.wrapperSupGrid}>
            {/* ── Row 1 ── display:contents → hijos son grid items directos */}
            <Box style={styles.wrapperSup}>
              {/* ARRIVAL — grid col 1 */}
              <Box className="hcc-card" style={styles.column}>
                <Box style={styles.headerInfo}>
                  <Box style={styles.topInfoLeft}>
                    <Text variant="label-xs" color="tertiary">
                      {viewModel.arrival.title}
                    </Text>
                    <Text variant="label-md">
                      {viewModel.arrival.flightNumber}
                    </Text>
                    <Tag
                      variant="base"
                      type="indigo"
                      label={viewModel.arrival.dateLabel}
                    />
                    {viewModel.arrival.status ? (
                      <StatusTag
                        variant="feedback"
                        type={viewModel.arrival.status.type}
                        label={viewModel.arrival.status.label}
                      />
                    ) : null}
                  </Box>
                  <Box style={styles.topInfoRight}>
                    <SeatEconomy size={18} color={colors.textTertiary} />
                    <Text variant="label-xs" color="tertiary">
                      {viewModel.arrival.passengerCount}
                    </Text>
                    <Text variant="label-sm">
                      {viewModel.arrival.station}
                    </Text>
                  </Box>
                </Box>
                <Box style={styles.bottomInfo}>
                  <Box style={styles.bottomInfoLeft}>
                    {viewModel.arrival.infoItems.map((item) => (
                      <InfoItem
                        key={item.label}
                        label={item.label}
                        value={item.value}
                      />
                    ))}
                  </Box>
                  <Box style={styles.bottomInfoRight}>
                    <Box style={styles.verticalDivider} />
                    <Box style={styles.pushInBox}>
                      <Text variant="label-xs" color="secondary">
                        {viewModel.arrival.actionTime.label}
                      </Text>
                      <Text variant="label-sm">
                        {viewModel.arrival.actionTime.value}
                      </Text>
                    </Box>
                  </Box>
                </Box>
              </Box>

              {/* PREFIXO / FLOTA — grid col 2 */}
              <Box className="hcc-midbox" style={styles.midBox}>
                <Text variant="label-xs" color="secondary">
                  PREFIXO
                </Text>
                <Text variant="label-sm">{viewModel.summary.prefix}</Text>
                <Text variant="label-xs" color="secondary">
                  FLOTA
                </Text>
                <Text variant="label-xs">
                  {viewModel.summary.fleetLabel}
                </Text>
              </Box>

              {/* DEPARTURE — grid col 3 */}
              <Box className="hcc-card" style={styles.columnR}>
                <Box style={styles.headerInfo}>
                  <Box style={styles.topInfoLeft}>
                    <Text variant="label-xs" color="tertiary">
                      {viewModel.departure.title}
                    </Text>
                    <Text variant="label-md">
                      {viewModel.departure.flightNumber}
                    </Text>
                    <Tag
                      variant="base"
                      type="indigo"
                      label={viewModel.departure.dateLabel}
                    />
                  </Box>
                  <Box style={styles.topInfoRight}>
                    <SeatEconomy size={18} color={colors.textTertiary} />
                    <Text variant="label-xs" color="tertiary">
                      {viewModel.departure.passengerCount}
                    </Text>
                    <Text variant="label-sm">
                      {viewModel.departure.station}
                    </Text>
                  </Box>
                </Box>
                <Box style={styles.bottomInfo}>
                  <Box style={styles.bottomInfoLeft}>
                    {viewModel.departure.infoItems.map((item) => (
                      <InfoItem
                        key={item.label}
                        label={item.label}
                        value={item.value}
                      />
                    ))}
                  </Box>
                  <Box style={styles.bottomInfoRight}>
                    <Box style={styles.verticalDivider} />
                    <Box style={styles.pushInBox}>
                      <Text variant="label-xs" color="secondary">
                        {viewModel.departure.actionTime.label}
                      </Text>
                      <Text variant="label-sm">
                        {viewModel.departure.actionTime.value}
                      </Text>
                    </Box>
                  </Box>
                </Box>
              </Box>

              {/* TEMPO DISPONÍVEL — grid col 4 */}
              <Box className="hcc-tempo" style={styles.estimatedTime}>
                <Text variant="label-xs" color="secondary">
                  TEMPO DISPONÍVEL
                </Text>
                <TempoDisponivelLive
                  availableEndDate={viewModel.summary.availableEndDate}
                  availableEndTime={viewModel.summary.availableEndTime}
                  pushOutTime={viewModel.summary.pushOutTime}
                  allTasksCompleted={viewModel.summary.allTasksCompleted}
                />
                {/* MTD oculto por el momento (no prioridad en la entrega actual). Descomentar para volver a mostrar.
                <Text variant="label-xs" color="secondary" style={{ marginTop: 2 }}>
                  {viewModel.summary.mtdLabel}
                </Text>
                */}
              </Box>
            </Box>

            {/* ── Row 2 (sub-bar) ── display:contents → misma grilla */}
            <Box style={{ display: 'contents' }}>
              {/* Arrival pills — grid col 1 */}
              <Box
                className="hcc-subbar-cell"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  minWidth: 0,
                  backgroundColor: '#F2F2F2',
                  borderTop: '1px solid #D9D9D9',
                  borderLeft: '4px solid transparent',
                  borderRight: '1px solid #D9D9D9',
                  boxSizing: 'border-box',
                }}
              >
                <FlightLanding size={32} color={colors.textPrimary} />
                <View
                  style={{
                    backgroundColor: '#FFF',
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 99999,
                  }}
                >
                  <Text
                    variant="label-xs"
                    color="secondary"
                    bold
                    style={{ fontSize: 14, padding: 4 }}
                  >
                    WCH: {viewModel.subBar.wchrArrival}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: '#FFF',
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 99999,
                  }}
                >
                  <Text
                    variant="label-xs"
                    color="secondary"
                    bold
                    style={{ fontSize: 14, padding: 4 }}
                  >
                    Bags CNX: {viewModel.subBar.bagsCnxArrival}
                  </Text>
                </View>
              </Box>

              {/* Centro: route type — grid col 2 */}
              <Box
                className="hcc-subbar-cell"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 14px',
                  backgroundColor: '#F2F2F2',
                  borderTop: '1px solid #D9D9D9',
                  borderRight: '1px solid #D9D9D9',
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap',
                }}
              >
                <Tag
                  variant="base"
                  type="neutral"
                  label="DOM - INTER"
                  style={{
                    paddingTop: 4,
                    paddingBottom: 4,
                    paddingLeft: 8,
                    paddingRight: 8,
                    borderRadius: 99999,
                  }}
                />
              </Box>

              {/* Departure pills — grid col 3 */}
              <Box
                className="hcc-subbar-cell"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  minWidth: 0,
                  backgroundColor: '#F2F2F2',
                  borderTop: '1px solid #D9D9D9',
                  borderLeft: '4px solid transparent',
                  borderRight: '1px solid #D9D9D9',
                  boxSizing: 'border-box',
                }}
              >
                <FlightTakeOff size={32} color={colors.textPrimary} />
                <View
                  style={{
                    backgroundColor: '#FFF',
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 99999,
                  }}
                >
                  <Text
                    variant="label-xs"
                    color="secondary"
                    bold
                    style={{ fontSize: 14, padding: 4 }}
                  >
                    WCH: {viewModel.subBar.wchrDeparture}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: '#FFF',
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 99999,
                  }}
                >
                  <Text
                    variant="label-xs"
                    color="secondary"
                    bold
                    style={{ fontSize: 14, padding: 4 }}
                  >
                    Bags CNX: {viewModel.subBar.bagsCnxDeparture}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: '#FFF',
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 99999,
                  }}
                >
                  <Text
                    variant="label-xs"
                    color="secondary"
                    bold
                    style={{ fontSize: 14, padding: 4 }}
                  >
                    Pax CNX: {viewModel.subBar.paxCnxDeparture}
                  </Text>
                </View>
              </Box>

              {/* Tempo Plan — grid col 4 */}
              <Box
                className="hcc-subbar-cell"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 14px',
                  backgroundColor: '#F2F2F2',
                  borderTop: '1px solid #D9D9D9',
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap',
                }}
              >
                <View
                  style={{
                    backgroundColor: colors.surfaceTagNeutral,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 99999,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    variant="label-xs"
                    color="primary"
                    style={{ fontSize: 14, padding: 4 }}
                  >
                    Tempo Plan:{' '}
                    {viewModel.subBar.tempoPlan ?? '--:--'}
                  </Text>
                </View>
              </Box>
            </Box>
          </Box>
        </Box>

        <FlightGanttTimeline
          staDate={viewModel.timeline.staDate}
          staTime={viewModel.timeline.staTime}
          etaDate={viewModel.timeline.etaDate}
          etaTime={viewModel.timeline.etaTime}
          stdDate={viewModel.timeline.stdDate}
          stdTime={viewModel.timeline.stdTime}
          etdDate={viewModel.timeline.etdDate}
          etdTime={viewModel.timeline.etdTime}
          pushOutTime={viewModel.timeline.pushOutTime}
          tasks={viewModel.timeline.tasks}
          tatVueloMinutos={viewModel.timeline.tatVueloMinutos}
          onRowClick={onRowClick}
        />
      </Box>
      <FlightInfoEventsPanel events={viewModel.events} />
    </Box>
  );
};
