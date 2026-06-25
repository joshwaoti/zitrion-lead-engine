/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as candidates from "../candidates.js";
import type * as discovery from "../discovery.js";
import type * as drafts from "../drafts.js";
import type * as events from "../events.js";
import type * as extension from "../extension.js";
import type * as leads from "../leads.js";
import type * as lib_candidateStats from "../lib/candidateStats.js";
import type * as lib_deviceAuth from "../lib/deviceAuth.js";
import type * as lib_json from "../lib/json.js";
import type * as lib_leadLogic from "../lib/leadLogic.js";
import type * as lib_modelGateway from "../lib/modelGateway.js";
import type * as lib_parse from "../lib/parse.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_workspace from "../lib/workspace.js";
import type * as modelConfig from "../modelConfig.js";
import type * as pipeline from "../pipeline.js";
import type * as pipelineAi from "../pipelineAi.js";
import type * as queue from "../queue.js";
import type * as settings from "../settings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  candidates: typeof candidates;
  discovery: typeof discovery;
  drafts: typeof drafts;
  events: typeof events;
  extension: typeof extension;
  leads: typeof leads;
  "lib/candidateStats": typeof lib_candidateStats;
  "lib/deviceAuth": typeof lib_deviceAuth;
  "lib/json": typeof lib_json;
  "lib/leadLogic": typeof lib_leadLogic;
  "lib/modelGateway": typeof lib_modelGateway;
  "lib/parse": typeof lib_parse;
  "lib/validators": typeof lib_validators;
  "lib/workspace": typeof lib_workspace;
  modelConfig: typeof modelConfig;
  pipeline: typeof pipeline;
  pipelineAi: typeof pipelineAi;
  queue: typeof queue;
  settings: typeof settings;
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
