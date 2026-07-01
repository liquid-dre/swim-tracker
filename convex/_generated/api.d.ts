/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analysis from "../analysis.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as personalBests from "../personalBests.js";
import type * as profiles from "../profiles.js";
import type * as results from "../results.js";
import type * as squads from "../squads.js";
import type * as swimmers from "../swimmers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analysis: typeof analysis;
  auth: typeof auth;
  authz: typeof authz;
  events: typeof events;
  http: typeof http;
  personalBests: typeof personalBests;
  profiles: typeof profiles;
  results: typeof results;
  squads: typeof squads;
  swimmers: typeof swimmers;
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
