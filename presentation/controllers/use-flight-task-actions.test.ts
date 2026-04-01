import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useDispatch } from 'react-redux';

import { VIEWER_TASK_ACTION_RESTRICTION_MESSAGE } from '@/domain/services/flight-task-permissions';
import {
  finishTask,
  startTask,
  updateTaskTimes,
} from '@/infrastructure/api/task-events-api';
import { useAuthSelector } from '@/presentation/adapters/redux/use-auth-selector';

import { useFlightTaskActions } from './use-flight-task-actions';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
}));

jest.mock('@/presentation/adapters/redux/use-auth-selector', () => ({
  useAuthSelector: jest.fn(),
}));

jest.mock('@/infrastructure/api/task-events-api', () => ({
  startTask: jest.fn(),
  finishTask: jest.fn(),
  updateTaskTimes: jest.fn(),
}));

describe('useFlightTaskActions', () => {
  const dispatchMock = jest.fn();
  const patchTaskMock = jest.fn();
  const loadFlightGanttMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(dispatchMock);
    (useAuthSelector as jest.Mock).mockReturnValue({
      session: null,
      role: 'viewer',
      userName: '',
      userPhotoUrl: '',
    });
  });

  it('rejects all task mutations for viewers before calling the API', async () => {
    const { result } = renderHook(() =>
      useFlightTaskActions({
        flight: {
          flightId: 'flight-1',
          std: '2026-03-24T10:00:00Z',
        } as never,
        patchTask: patchTaskMock,
        loadFlightGantt: loadFlightGanttMock,
      }),
    );

    const task = {
      instanceId: 'task-1',
      title: 'Pushback',
      plannedStartTime: '10:00',
      plannedEndTime: '10:30',
    };

    await expect(result.current.startTask(task, '10:05')).rejects.toThrow(
      VIEWER_TASK_ACTION_RESTRICTION_MESSAGE,
    );
    await expect(result.current.finishTask(task, '10:15')).rejects.toThrow(
      VIEWER_TASK_ACTION_RESTRICTION_MESSAGE,
    );
    await expect(
      result.current.updateTask(task, '10:05', '10:15'),
    ).rejects.toThrow(VIEWER_TASK_ACTION_RESTRICTION_MESSAGE);

    expect(startTask).not.toHaveBeenCalled();
    expect(finishTask).not.toHaveBeenCalled();
    expect(updateTaskTimes).not.toHaveBeenCalled();
    expect(patchTaskMock).not.toHaveBeenCalled();
  });

  it('completeHitoTask sends one PATCH (updateTaskTimes) for marco when hito is pending', async () => {
    (useAuthSelector as jest.Mock).mockReturnValue({
      session: null,
      role: 'admin',
      userName: '',
      userPhotoUrl: '',
    });
    (updateTaskTimes as jest.Mock).mockResolvedValue({
      success: true,
      instanceId: 'hito-1',
    });

    const { result } = renderHook(() =>
      useFlightTaskActions({
        flight: {
          flightId: 'flight-1',
          std: '2026-03-24T10:00:00Z',
        } as never,
        patchTask: patchTaskMock,
        loadFlightGantt: loadFlightGanttMock,
      }),
    );

    await act(async () => {
      await result.current.completeHitoTask(
        {
          instanceId: 'hito-1',
          title: 'Marco',
          plannedStartTime: '10:00',
          plannedEndTime: '10:05',
        },
        '11:30',
        false,
      );
    });

    expect(startTask).not.toHaveBeenCalled();
    expect(finishTask).not.toHaveBeenCalled();
    expect(updateTaskTimes).toHaveBeenCalledTimes(1);
    expect(updateTaskTimes).toHaveBeenCalledWith(
      'hito-1',
      '11:30',
      '11:30',
      '2026-03-24T10:00:00Z',
    );
    expect(loadFlightGanttMock).toHaveBeenCalledWith('flight-1');
  });

  it('completeHitoTask only calls finish when hito already has real start', async () => {
    (useAuthSelector as jest.Mock).mockReturnValue({
      session: null,
      role: 'admin',
      userName: '',
      userPhotoUrl: '',
    });
    (finishTask as jest.Mock).mockResolvedValue({
      status_nuevo: 'COMPLETED',
    });

    const { result } = renderHook(() =>
      useFlightTaskActions({
        flight: {
          flightId: 'flight-1',
          std: '2026-03-24T10:00:00Z',
        } as never,
        patchTask: patchTaskMock,
        loadFlightGantt: loadFlightGanttMock,
      }),
    );

    await act(async () => {
      await result.current.completeHitoTask(
        {
          instanceId: 'hito-2',
          title: 'Marco',
          startTimeLabel: '10:00',
          plannedEndTime: '10:05',
        },
        '11:00',
        true,
      );
    });

    expect(finishTask).toHaveBeenCalledTimes(1);
    expect(updateTaskTimes).not.toHaveBeenCalled();
  });
});
