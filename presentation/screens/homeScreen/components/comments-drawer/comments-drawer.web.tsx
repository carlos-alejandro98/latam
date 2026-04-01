import { CloseOutlined } from '@hangar/react-icons/core/interaction/CloseOutlined';
import { SendOutlined } from '@hangar/react-icons/core/interaction/SendOutlined';
import { ButtonAdapter } from '@/presentation/adapters/ui/button';
import { IconButton } from '@/presentation/components/design-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Divider,
  Text,
  TextField,
} from '@/presentation/components/design-system';
import type {
  CommentsDrawerProps,
  TaskStatus,
} from '@/presentation/screens/homeScreen/components/comments-drawer/comments-drawer.types';

import {
  getBackdropStyle,
  getDrawerStyle,
  styles,
} from './comments-drawer.styles.web';

import type { ChangeEvent, CSSProperties, ReactElement } from 'react';

const ANIMATION_DURATION_MS = 240;

/** Normalize backend status values (e.g. COMPLETED, IN_PROGRESS) to frontend keys */
const normalizeStatus = (status: string): string => {
  const map: Record<string, string> = {
    COMPLETED: 'COMPLETADA',
    IN_PROGRESS: 'EN_PROGRESO',
    PENDING: 'PENDIENTE',
  };
  return map[status] ?? status;
};

const statusLabel: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  COMPLETADA: 'Completada',
};

const statusDotStyle = (status: string): CSSProperties => {
  const normalized = normalizeStatus(status);
  const color =
    normalized === 'EN_PROGRESO'
      ? '#2C31C9'
      : normalized === 'COMPLETADA'
        ? '#075F5B'
        : '#9E9E9E';
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    marginRight: 6,
    flexShrink: 0,
    ...(status === 'EN_PROGRESO'
      ? {
          boxShadow: `0 0 0 0 ${color}`,
          animation: 'pulse-dot 1.4s ease-in-out infinite',
        }
      : {}),
  };
};

/**
 * Masks a raw string into strict "HH:mm" format.
 * - Only digits are kept; the colon at position 2 is always preserved.
 * - Hours are clamped to 0-23, minutes to 0-59.
 * - The colon is never removed — once the user types 2 digits it is
 *   inserted automatically, and any attempt to delete it is ignored.
 */
const maskTimeInput = (raw: string): string => {
  // Keep only digits, limit to 4
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const formatCommentHour = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const CommentsDrawer = ({
  isOpen,
  drawerWidth,
  comments,
  loading,
  submitting,
  draftComment,
  canComment,
  canSendComment,
  canManageTaskActions,
  error,
  selectedProcess,
  onClose,
  onChangeDraftComment,
  onSendComment,
  onSave,
  onChangeStartTime,
  onChangeEndTime,
  ganttLoading,
  onStartTask,
  onFinishTask,
  onUpdateTask,
}: CommentsDrawerProps): ReactElement | null => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isDrawerVisible, setIsDrawerVisible] = useState(isOpen);
  const normalizeTime = (t: string | undefined): string =>
    t === '24:00' ? '00:00' : (t ?? '');
  const [startTime, setStartTime] = useState(
    normalizeTime(selectedProcess?.startTime),
  );
  const [endTime, setEndTime] = useState(
    normalizeTime(selectedProcess?.endTime),
  );
  const [taskActionLoading, setTaskActionLoading] = useState(false);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<TaskStatus>(
    selectedProcess?.taskStatus ?? 'PENDIENTE',
  );
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  // Sync time inputs when the selected TASK changes (different taskInstanceId).
  // Also sync currentStatus whenever taskStatus changes on the *same* task so
  // that pressing Iniciar correctly transitions the button to Finalizar.
  const prevTaskInstanceIdRef = useRef<string | undefined>(undefined);
  const prevTaskStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const newId = selectedProcess?.taskInstanceId;
    const newStatus = selectedProcess?.taskStatus;
    const idChanged = newId !== prevTaskInstanceIdRef.current;
    const statusChanged = newStatus !== prevTaskStatusRef.current;

    if (idChanged) {
      prevTaskInstanceIdRef.current = newId;
      prevTaskStatusRef.current = newStatus;
      setStartTime(normalizeTime(selectedProcess?.startTime));
      setEndTime(normalizeTime(selectedProcess?.endTime));
      setCurrentStatus(selectedProcess?.taskStatus ?? 'PENDIENTE');
      setTaskActionLoading(false);
      setTaskActionError(null);
    } else if (statusChanged) {
      // Same task — only update status, preserve the user's typed times
      prevTaskStatusRef.current = newStatus;
      setCurrentStatus(newStatus ?? 'PENDIENTE');
    }
  }, [selectedProcess]);

  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (isOpen) {
      setShouldRender(true);
      setIsDrawerVisible(false);
      animationFrameRef.current = requestAnimationFrame(() => {
        setIsDrawerVisible(true);
        animationFrameRef.current = null;
      });
      return;
    }

    setIsDrawerVisible(false);
    closeTimeoutRef.current = setTimeout(() => {
      setShouldRender(false);
      closeTimeoutRef.current = null;
    }, ANIMATION_DURATION_MS);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [isOpen]);

  const handleStartTask = useCallback(async () => {
    if (
      !canManageTaskActions ||
      !selectedProcess?.taskInstanceId ||
      taskActionLoading
    )
      return;
    setTaskActionLoading(true);
    setTaskActionError(null);
    try {
      await onStartTask?.(selectedProcess.taskInstanceId, startTime);
      setCurrentStatus('EN_PROGRESO');
    } catch {
      setTaskActionError('Error al iniciar la tarea. Intenta de nuevo.');
    } finally {
      setTaskActionLoading(false);
    }
  }, [
    canManageTaskActions,
    selectedProcess,
    taskActionLoading,
    onStartTask,
    startTime,
  ]);

  const handleFinishTask = useCallback(async () => {
    if (
      !canManageTaskActions ||
      !selectedProcess?.taskInstanceId ||
      taskActionLoading
    )
      return;
    setTaskActionLoading(true);
    setTaskActionError(null);
    try {
      await onFinishTask?.(selectedProcess.taskInstanceId, endTime);
      setCurrentStatus('COMPLETADA');
    } catch {
      setTaskActionError('Error al finalizar la tarea. Intenta de nuevo.');
    } finally {
      setTaskActionLoading(false);
    }
  }, [
    canManageTaskActions,
    selectedProcess,
    taskActionLoading,
    onFinishTask,
    endTime,
  ]);

  const isHito =
    selectedProcess?.tipoEvento?.toUpperCase() === 'HITO';

  const handleCompleteHito = useCallback(async () => {
    if (
      !canManageTaskActions ||
      !selectedProcess?.taskInstanceId ||
      taskActionLoading
    )
      return;
    setTaskActionLoading(true);
    setTaskActionError(null);
    try {
      // Mismo criterio que mobile/tablet: un solo PATCH inicio+fin (evita carrera start+finish).
      await onUpdateTask?.(selectedProcess.taskInstanceId, endTime, endTime);
      setCurrentStatus('COMPLETADA');
    } catch {
      setTaskActionError('Error al completar el hito. Intenta de nuevo.');
    } finally {
      setTaskActionLoading(false);
    }
  }, [
    canManageTaskActions,
    selectedProcess,
    taskActionLoading,
    onUpdateTask,
    endTime,
  ]);

  const handleUpdateHito = useCallback(async () => {
    if (
      !canManageTaskActions ||
      !selectedProcess?.taskInstanceId ||
      taskActionLoading
    )
      return;
    setTaskActionLoading(true);
    setTaskActionError(null);
    try {
      await onUpdateTask?.(
        selectedProcess.taskInstanceId,
        endTime,
        endTime,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al actualizar el hito. Intenta de nuevo.';
      setTaskActionError(msg);
    } finally {
      setTaskActionLoading(false);
    }
  }, [
    canManageTaskActions,
    selectedProcess,
    taskActionLoading,
    onUpdateTask,
    endTime,
  ]);

  const handleUpdateTask = useCallback(async () => {
    if (
      !canManageTaskActions ||
      !selectedProcess?.taskInstanceId ||
      taskActionLoading
    )
      return;
    setTaskActionLoading(true);
    setTaskActionError(null);
    try {
      await onUpdateTask?.(selectedProcess.taskInstanceId, startTime, endTime);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al actualizar la tarea. Intenta de nuevo.';
      setTaskActionError(msg);
    } finally {
      setTaskActionLoading(false);
    }
  }, [
    canManageTaskActions,
    selectedProcess,
    taskActionLoading,
    onUpdateTask,
    startTime,
    endTime,
  ]);

  const handleDraftChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangeDraftComment(event.target.value);
    },
    [onChangeDraftComment],
  );

  const handleStartTimeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const masked = maskTimeInput(event.target.value);
      setStartTime(masked);
      onChangeStartTime?.(masked);
    },
    [onChangeStartTime],
  );

  const handleEndTimeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const masked = maskTimeInput(event.target.value);
      setEndTime(masked);
      onChangeEndTime?.(masked);
    },
    [onChangeEndTime],
  );

  const drawerStyle = useMemo(
    () => getDrawerStyle(drawerWidth, isDrawerVisible, ANIMATION_DURATION_MS),
    [drawerWidth, isDrawerVisible],
  );

  const backdropStyle = useMemo(
    () => getBackdropStyle(isDrawerVisible, ANIMATION_DURATION_MS),
    [isDrawerVisible],
  );

  // Deterministic colour per author so the same author always gets the same chip colour.
  const authorColorMap = useMemo(() => {
    const palette = [
      { bg: '#EBEEFE', text: '#2C31C9' },
      { bg: '#E8F5E9', text: '#075F5B' },
      { bg: '#FFF3E0', text: '#B45A00' },
      { bg: '#FCE4EC', text: '#B71C6A' },
      { bg: '#E3F2FD', text: '#1565C0' },
    ];
    const map: Record<string, { bg: string; text: string }> = {};
    comments.forEach((c) => {
      if (!map[c.authorCode]) {
        const index = Object.keys(map).length % palette.length;
        map[c.authorCode] = palette[index];
      }
    });
    return map;
  }, [comments]);

  const commentRows: ReactElement[] = [];
  for (const comment of comments) {
    const color = authorColorMap[comment.authorCode] ?? {
      bg: '#EBEEFE',
      text: '#2C31C9',
    };
    commentRows.push(
      <div
        key={comment.id}
        style={{
          ...styles.commentRow,
          animation: 'comment-enter 220ms ease both',
        }}
      >
        <div style={{ ...styles.authorBadge, backgroundColor: color.bg }}>
          <Text
            variant="label-xs"
            style={{ color: color.text, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {comment.authorCode}
          </Text>
        </div>
        <div style={styles.commentBubble}>
          <Text variant="label-xs" style={styles.commentTime}>
            {formatCommentHour(comment.createdAt)}
          </Text>
          <Text variant="label-xs">{comment.message}</Text>
        </div>
      </div>,
    );
  }

  if (!shouldRender) {
    return null;
  }

  const normalizedStatus = normalizeStatus(currentStatus);
  const isCompleted = normalizedStatus === 'COMPLETADA';
  const isInProgress = normalizedStatus === 'EN_PROGRESO';

  return (
    <div style={styles.overlay}>
      {/* Keyframe injection for pulsing dot, spin, and comment entry animations */}
      <style>{`
        @keyframes pulse-dot {
          0%   { box-shadow: 0 0 0 0 rgba(44,49,201,0.55); }
          70%  { box-shadow: 0 0 0 7px rgba(44,49,201,0); }
          100% { box-shadow: 0 0 0 0 rgba(44,49,201,0); }
        }
        @keyframes comment-enter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={drawerStyle}>
        <div style={styles.header}>
          <button type="button" onClick={onClose} style={styles.closeButton}>
            <CloseOutlined size={32} />
          </button>
          <Text variant="heading-lg" style={styles.title}>
            Editar Proceso
          </Text>
        </div>
        <Divider />
        <div style={styles.processSection}>
          {/* Task name + status pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text variant="label-md" style={{ flex: 1 }}>
              {selectedProcess?.name ?? '—'}
            </Text>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 10px',
                borderRadius: 12,
                backgroundColor: isCompleted
                  ? '#E8F5E9'
                  : isInProgress
                    ? '#EEF0FD'
                    : '#F5F5F5',
                transition: 'background-color 300ms ease',
              }}
            >
              <span style={statusDotStyle(currentStatus)} />
              <Text
                variant="label-xs"
                style={{
                  color: isCompleted
                    ? '#075F5B'
                    : isInProgress
                      ? '#2C31C9'
                      : '#9E9E9E',
                  fontWeight: 600,
                  transition: 'color 300ms ease',
                }}
              >
                {statusLabel[normalizedStatus] ?? normalizedStatus}
              </Text>
            </div>
          </div>

          <div style={styles.timeFields}>
            {isHito ? (
              <TextField
                id="drawer-hito-time-input"
                label="Hora"
                value={endTime}
                placeholder="00:00"
                disabled={
                  !canManageTaskActions ||
                  submitting ||
                  taskActionLoading
                }
                onChange={handleEndTimeChange}
                cleanable
              />
            ) : (
              <>
                <TextField
                  id="drawer-start-time-input"
                  label="Inicio"
                  value={startTime}
                  placeholder="00:00"
                  disabled={
                    !canManageTaskActions ||
                    submitting ||
                    taskActionLoading ||
                    isInProgress
                  }
                  onChange={handleStartTimeChange}
                  cleanable
                />
                <TextField
                  id="drawer-end-time-input"
                  label="Fin"
                  value={endTime}
                  placeholder="00:00"
                  disabled={
                    !canManageTaskActions ||
                    submitting ||
                    taskActionLoading ||
                    (!isInProgress && !isCompleted)
                  }
                  onChange={handleEndTimeChange}
                  cleanable
                />
              </>
            )}
          </div>

          {/* Error message from backend action */}
          {taskActionError ? (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                backgroundColor: '#FFF0F0',
                border: '1px solid #FFCDD2',
                marginBottom: 4,
              }}
            >
              <Text variant="label-xs" style={{ color: '#C8001E' }}>
                {taskActionError}
              </Text>
            </div>
          ) : null}

          <div style={styles.timeButtons}>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                width: '100%',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={taskActionLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 20px',
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderStyle: 'solid',
                  borderColor: '#D0D0D0',
                  backgroundColor: 'transparent',
                  color: '#5A5A5A',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: taskActionLoading ? 'not-allowed' : 'pointer',
                  opacity: taskActionLoading ? 0.5 : 1,
                  transition: 'opacity 200ms ease',
                }}
              >
                Cancelar
              </button>
              {isHito ? (
                <button
                  type="button"
                  disabled={!canManageTaskActions || taskActionLoading}
                  onClick={() => {
                    void (isCompleted
                      ? handleUpdateHito()
                      : handleCompleteHito());
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 20px',
                    borderRadius: 20,
                    borderWidth: 0,
                    borderStyle: 'solid',
                    borderColor: 'transparent',
                    backgroundColor:
                      !canManageTaskActions || taskActionLoading
                        ? '#6B71D8'
                        : '#2C31C9',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor:
                      !canManageTaskActions || taskActionLoading
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      !canManageTaskActions || taskActionLoading ? 0.75 : 1,
                    transition:
                      'background-color 200ms ease, opacity 200ms ease',
                    minWidth: 130,
                    justifyContent: 'center',
                  }}
                >
                  {taskActionLoading ? (
                    <>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          borderWidth: 2,
                          borderStyle: 'solid',
                          borderColor: 'rgba(255,255,255,0.35)',
                          borderTopColor: '#fff',
                          animation: 'spin 0.7s linear infinite',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      {isCompleted ? 'Actualizando...' : 'Completando...'}
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>
                        &#10003;
                      </span>
                      {isCompleted ? 'Actualizar' : 'Completar'}
                    </>
                  )}
                </button>
              ) : isInProgress ? (
                <button
                  type="button"
                  disabled={
                    !canManageTaskActions || taskActionLoading || ganttLoading
                  }
                  onClick={() => {
                    void handleFinishTask();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 20px',
                    borderRadius: 20,
                    borderWidth: 0,
                    borderStyle: 'solid',
                    borderColor: 'transparent',
                    backgroundColor:
                      !canManageTaskActions || taskActionLoading || ganttLoading
                        ? '#6B71D8'
                        : '#2C31C9',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor:
                      !canManageTaskActions || taskActionLoading || ganttLoading
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      !canManageTaskActions || taskActionLoading ? 0.75 : 1,
                    transition:
                      'background-color 200ms ease, opacity 200ms ease',
                    minWidth: 130,
                    justifyContent: 'center',
                  }}
                >
                  {taskActionLoading ? (
                    <>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          borderWidth: 2,
                          borderStyle: 'solid',
                          borderColor: 'rgba(255,255,255,0.35)',
                          borderTopColor: '#fff',
                          animation: 'spin 0.7s linear infinite',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      Finalizando...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>
                        &#10003;
                      </span>
                      Finalizar
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canManageTaskActions || taskActionLoading}
                  onClick={() => {
                    void (isCompleted ? handleUpdateTask() : handleStartTask());
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 20px',
                    borderRadius: 20,
                    borderWidth: 0,
                    borderStyle: 'solid',
                    borderColor: 'transparent',
                    backgroundColor:
                      !canManageTaskActions || taskActionLoading
                        ? '#6B71D8'
                        : '#2C31C9',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor:
                      !canManageTaskActions || taskActionLoading
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      !canManageTaskActions || taskActionLoading ? 0.75 : 1,
                    transition:
                      'background-color 200ms ease, opacity 200ms ease',
                    minWidth: 130,
                    justifyContent: 'center',
                  }}
                >
                  {taskActionLoading ? (
                    <>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          borderWidth: 2,
                          borderStyle: 'solid',
                          borderColor: 'rgba(255,255,255,0.35)',
                          borderTopColor: '#fff',
                          animation: 'spin 0.7s linear infinite',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      {isCompleted ? 'Actualizando...' : 'Iniciando...'}
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 15, lineHeight: 1 }}>
                        &#9654;
                      </span>
                      {isCompleted ? 'Actualizar' : 'Iniciar'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <Divider />

        <div style={styles.composer}>
          <div style={styles.composerInputWrapper}>
            <TextField
              id="drawer-comment-input"
              label=""
              value={draftComment}
              placeholder="Comentario"
              disabled={!canComment || submitting}
              onChange={handleDraftChange}
              cleanable
            />
          </div>
          <IconButton
            id="drawer-send-comment-button"
            icon={SendOutlined}
            onClick={onSendComment}
            disabled={!canComment || !canSendComment || submitting}
            loading={submitting}
            variant="primary"
            colorMode="standard"
            aria-label="Enviar comentario"
          />
        </div>
        <div style={styles.commentsSection}>
          {error ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 8,
                backgroundColor: '#FFF0F0',
                border: '1px solid #FFCDD2',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  color: '#C8001E',
                  fontSize: 14,
                  lineHeight: 1.4,
                  flexShrink: 0,
                }}
              >
                &#9888;
              </span>
              <Text variant="label-xs" style={{ color: '#C8001E' }}>
                No se pudo completar la operacion. Por favor intenta de nuevo.
              </Text>
            </div>
          ) : null}

          <div style={styles.commentsList}>
            {!comments.length ? (
              <Text variant="label-sm">
                {loading
                  ? 'Cargando comentarios...'
                  : 'Sin comentarios disponibles.'}
              </Text>
            ) : (
              commentRows
            )}
          </div>
        </div>
      </div>

      <div style={backdropStyle}>
        <button
          type="button"
          onClick={onClose}
          style={styles.backdropPressable}
          aria-label="Cerrar comentarios"
        />
      </div>
    </div>
  );
};
