import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';

import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';

import { container } from '@/dependencyInjection/container';
import {
  applyAuthSessionToHttpClient,
  clearAuthSessionFromHttpClient,
} from '@/infrastructure/api/axios-client';
import { useAuthStoreAdapter } from '@/presentation/adapters/redux-auth-adapter';
import type { AppDispatch } from '@/store';
import { appResetState } from '@/store/actions/app-reset-actions';
import { setUserPhotoUrl, setRole } from '@/store/slices/auth-slice';
import { decodeJwtPayload } from '@/domain/services/jwt-validator';

interface AuthGuardProps {
  children: React.ReactNode;
  /** When provided, only allows users with one of these roles. */
  allowedRoles?: string[];
}

const extractRolesFromToken = (token: string): string[] => {
  if (!token) return [];
  try {
    const claims = decodeJwtPayload(token) as { role?: string | string[]; roles?: string[] };
    return [
      ...(Array.isArray(claims.roles) ? claims.roles : []),
      ...(Array.isArray(claims.role) ? claims.role : typeof claims.role === 'string' ? [claims.role] : []),
    ].map((r) => r.toLowerCase());
  } catch {
    return [];
  }
};

export const AuthGuard: React.FC<AuthGuardProps> = ({ children, allowedRoles }) => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { session, setSession, role } = useAuthStoreAdapter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const doRestore = async () => {
      // Session already in Redux state — use it directly (e.g. after hot reload)
      if (session?.accessToken) {
        applyAuthSessionToHttpClient(session);
        if (session.userPhotoUrl) dispatch(setUserPhotoUrl(session.userPhotoUrl));
        if (!cancelled) {
          setIsAuthenticated(true);
          setIsCheckingSession(false);
        }
        return;
      }

      // Try to restore from persistent storage (may trigger a token refresh)
      const restoredSession = await container.restoreAuthSessionUseCase.execute();

      if (cancelled) return;

      if (!restoredSession) {
        dispatch(appResetState());
        clearAuthSessionFromHttpClient();
        setIsAuthenticated(false);
        setIsCheckingSession(false);
        return;
      }

      setSession(restoredSession);
      applyAuthSessionToHttpClient(restoredSession);

      if (restoredSession.userPhotoUrl) {
        dispatch(setUserPhotoUrl(restoredSession.userPhotoUrl));
      }

      const candidateRoles = [
        ...extractRolesFromToken(restoredSession.idToken ?? ''),
        ...extractRolesFromToken(restoredSession.accessToken ?? ''),
      ];
      if (candidateRoles.includes('admin')) {
        dispatch(setRole('admin'));
      } else if (candidateRoles.includes('viewer')) {
        dispatch(setRole('viewer'));
      } else if (candidateRoles.includes('controller')) {
        dispatch(setRole('controller'));
      } else if (candidateRoles.includes('above_the_wing')) {
        dispatch(setRole('above_the_wing'));
      } else if (candidateRoles.includes('below_the_wing')) {
        dispatch(setRole('below_the_wing'));
      }

      setIsAuthenticated(true);
    };

    // Hard timeout — if the restore takes more than 10 s (e.g. Azure is slow
    // or the refresh network call hangs), bail out and redirect to login so
    // the user is never stuck on an infinite spinner.
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      console.log('[AuthGuard] Timeout al restaurar sesión — redirigiendo a login.');
      dispatch(appResetState());
      clearAuthSessionFromHttpClient();
      setIsAuthenticated(false);
      setIsCheckingSession(false);
    }, 10_000);

    doRestore()
      .catch(() => {
        if (cancelled) return;
        dispatch(appResetState());
        clearAuthSessionFromHttpClient();
        setIsAuthenticated(false);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setIsCheckingSession(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Tras el primer chequeo, mantener `isAuthenticated` alineado con Redux.
   * Si el usuario cierra sesión en esta pantalla, `session` pasa a null pero el
   * estado local seguía en true y la ruta protegida no redirigía a /login (nativo).
   */
  useEffect(() => {
    if (isCheckingSession) return;
    if (!session?.accessToken) {
      setIsAuthenticated(false);
    }
  }, [isCheckingSession, session?.accessToken]);

  // Redirect to login when unauthenticated, or to home if role is not allowed
  useEffect(() => {
    if (isCheckingSession) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
      // Authenticated but wrong role — send back to turnaround root
      router.replace('/turnaround');
    }
  }, [isCheckingSession, isAuthenticated, role, allowedRoles, router]);

  // Show nothing while checking
  if (isCheckingSession) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0D12AB" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
