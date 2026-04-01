# AptoTatGantt — Resumen técnico del proyecto

Aplicación **Expo / React Native** con **React Native Web** para operación de turnaround (Gantt de vuelos, tareas, hitos). Un solo código base comparte dominio, estado y gran parte de la presentación; la **superficie** (web vs móvil vs tablet nativa) se elige por plataforma y tamaño de dispositivo.

---

## Stack principal

| Área | Tecnología |
|------|------------|
| Framework | **Expo SDK ~54**, **React 19**, **React Native 0.81** |
| Navegación | **Expo Router** (file-based), **React Navigation** (Stack) |
| Estado global | **Redux Toolkit** (`@reduxjs/toolkit`), **react-redux** |
| HTTP | **Axios** (cliente `FlightsHttpClient`, interceptores de auth) |
| Estilos / UI | **React Native** primitives, **styled-components** (p. ej. tema web), librerías **@hangar/** (web-components, mobile-components, iconos web/native) |
| Gráficos / lista virtualizada (web) | **@visx/scale**, **react-window** |
| Animación / gestos | **react-native-reanimated**, **react-native-gesture-handler** |
| Auth | **expo-auth-session**, **expo-secure-store**, **expo-web-browser** |
| Tipado | **TypeScript ~5.9** |
| Tests | **Jest**, **jest-expo**, **@testing-library/react-native** |
| Calidad | **ESLint** (config Expo + TypeScript), **Prettier** |
| CI/CD | **GitLab CI** (componente compartido LATAM para despliegue React/GKE) |

**Build web:** `expo export --platform web` (salida estática en `app.json` → `web.output: static`).

---

## Tres experiencias: Web, Mobile, Tablet

La ruta principal de turnaround es `app/turnaround/index.tsx`. La decisión es:

| Contexto | Vista raíz | Pantalla principal |
|----------|------------|-------------------|
| **Web** (`Platform.OS === 'web'`) | `ControllerTurnaroundView` | `HomeScreen` (`presentation/screens/homeScreen/home-screen.tsx`) — experiencia “controller”: lista de vuelos, panel de información, Gantt timeline, comentarios, etc. |
| **Nativo tablet** (iPad o Android ≥ ~600 dp menor dimensión) | `TabletTurnaroundView` | `TabletHomeScreen` — lista/tablet de vuelos + detalle tablet |
| **Nativo phone** | `MobileTurnaroundView` | `MobileHomeScreen` — drawer de lista de vuelos + detalle móvil |

Hook central: **`useResponsive`** (`presentation/hooks/use-responsive.ts`):

- En **web** siempre se considera “desktop” para este shell (no se conmuta a layout tablet por ancho de ventana).
- En **iOS**, tablet si el dispositivo es iPad (`isPad`).
- En **Android**, heurística `min(width, height) >= 600`.

Resolución de archivos **`.web.tsx` / `.native.tsx`**: Metro/Expo elige implementación por plataforma (p. ej. `app-header`, logos, acciones del header).

---

## Arquitectura de carpetas (orientación)

El backend de la aplicación (reglas y datos) sigue una **arquitectura hexagonal (ports & adapters)**: el **dominio** y los **casos de uso** no dependen de frameworks ni de HTTP; los **puertos** (`application/ports`) definen contratos y la **infraestructura** implementa adaptadores (API, storage). La capa **presentation** actúa como otro adaptador de entrada (UI + estado). Se busca además **código limpio (clean code)**: responsabilidades acotadas, nombres expresivos, use cases pequeños y tests donde aplica.

```
app/                    # Expo Router: layouts y rutas (auth, turnaround, etc.)
application/            # Casos de uso + ports (interfaces hacia el dominio/infra)
domain/                 # Entidades, errores, reglas de negocio puras
infrastructure/         # Adaptadores de salida: API (axios), storage, interceptores
presentation/           # Adaptador de entrada: UI, controllers, view-models, hooks, tema
store/                  # Redux: slices, middleware, root reducer (orquestación con casos de uso)
dependencyInjection/    # Composición raíz: wiring use cases ↔ implementaciones (container)
config/                 # ENV, flags de plataforma (IS_WEB, etc.)
shared/                 # Utilidades compartidas
```

Flujo típico: **pantalla** → **controller hook** → **dispatch thunk / adapter** → **use case** → **puerto (repository)** → **adaptador en infrastructure** → **HTTP**.

---

## Estado Redux (slices relevantes)

- **`flights`**: lista de vuelos activos (`fetchActiveFlights` → API `active-flights-v2`).
- **`flightGantt`**: Gantt del vuelo seleccionado (`fetchFlightGantt` → API `turnarounds/flight/gantt`).
- **`flightSelection`**: vuelo(s) seleccionado(s); persistencia vía middleware + **localStorage** (web) / adaptador equivalente.
- **`auth`**: sesión y rol (afecta permisos de tareas).
- **`sessionEvents`**: eventos de sesión para panel de información.
- **`flightComments`**: comentarios por tarea (donde aplique).

---

## APIs backend (referencia)

Definidas en repositorios bajo `infrastructure/api/` (ejemplos):

- `GET /api/v1/tracking/active-flights-v2` — vuelos activos (rango de fechas `ddMMyyyy`).
- `GET /api/v1/turnarounds/flight/gantt` — Gantt/turnaround por `flightId`.
- Endpoints de tareas (start/finish/update) en `task-events-api`.
- SSE u otros canales en hooks como `use-gantt-stream` / realtime según configuración.

Base URL y secretos: **`config/environment`** (variables de entorno, script `setup-env` en postinstall).

---

## Scripts npm útiles

| Script | Uso |
|--------|-----|
| `npm run start` | Expo dev server |
| `npm run web` | Misma app en navegador |
| `npm run ios` / `android` | Simuladores / dispositivos |
| `npm run test` | Jest |
| `npm run lint` | ESLint |
| `npm run export:web` / `build` | Export estático web |

---

## Testing y calidad

- Tests unitarios junto a slices, use cases, repositorios y algunos hooks/componentes.
- **Sonar** disponible vía script `npm run sonar` (según configuración del entorno).

---

## Notas operativas

- **CORS en web:** peticiones desde `localhost` al API en otro origen generan **preflight (OPTIONS)** + **XHR**; es comportamiento esperado del navegador.
- **New Architecture** React Native habilitada en `app.json` (`newArchEnabled`).
- **React Compiler** en experimentos de Expo según `app.json`.

---

## Documentación adicional en el repo

En `docs/` existen guías más detalladas (testing, estado, arquitectura, PRs, etc.). Este archivo es solo un **resumen orientativo** para onboarding técnico.
