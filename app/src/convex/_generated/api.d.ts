/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _helpers from "../_helpers.js";
import type * as algoritmoCajas from "../algoritmoCajas.js";
import type * as auth from "../auth.js";
import type * as cajas from "../cajas.js";
import type * as capacitaciones from "../capacitaciones.js";
import type * as cobertura from "../cobertura.js";
import type * as crons from "../crons.js";
import type * as evaluaciones from "../evaluaciones.js";
import type * as horarios from "../horarios.js";
import type * as indicadores from "../indicadores.js";
import type * as inducciones from "../inducciones.js";
import type * as lib_algoritmoCajas from "../lib/algoritmoCajas.js";
import type * as lib_slotTimes from "../lib/slotTimes.js";
import type * as logs from "../logs.js";
import type * as notificaciones from "../notificaciones.js";
import type * as personales from "../personales.js";
import type * as planillas from "../planillas.js";
import type * as plantillaBase64 from "../plantillaBase64.js";
import type * as reporteUbicaciones from "../reporteUbicaciones.js";
import type * as reuniones from "../reuniones.js";
import type * as tablero from "../tablero.js";
import type * as tareas from "../tareas.js";
import type * as tiendas from "../tiendas.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _helpers: typeof _helpers;
  algoritmoCajas: typeof algoritmoCajas;
  auth: typeof auth;
  cajas: typeof cajas;
  capacitaciones: typeof capacitaciones;
  cobertura: typeof cobertura;
  crons: typeof crons;
  evaluaciones: typeof evaluaciones;
  horarios: typeof horarios;
  indicadores: typeof indicadores;
  inducciones: typeof inducciones;
  "lib/algoritmoCajas": typeof lib_algoritmoCajas;
  "lib/slotTimes": typeof lib_slotTimes;
  logs: typeof logs;
  notificaciones: typeof notificaciones;
  personales: typeof personales;
  planillas: typeof planillas;
  plantillaBase64: typeof plantillaBase64;
  reporteUbicaciones: typeof reporteUbicaciones;
  reuniones: typeof reuniones;
  tablero: typeof tablero;
  tareas: typeof tareas;
  tiendas: typeof tiendas;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
