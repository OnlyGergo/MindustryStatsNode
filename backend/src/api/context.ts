import { type ApiServiceConfig, loadBaseConfig } from '../shared/config.js';

/**
 * API config, resolved from env at import time. Read at module scope (rather than
 * injected) so `app.ts` is a plain importable module and Eden Treaty can infer
 * its type without the app having to be constructed first.
 */
export const apiConfig: ApiServiceConfig = {
  ...loadBaseConfig(),
  PORT: parseInt(process.env.PORT || '3000'),
  GRAPH_MAX_POINTS: parseInt(process.env.GRAPH_MAX_POINTS || '168'),
  DATA_COLLECTION_INTERVAL_MS: parseInt(process.env.DATA_COLLECTION_INTERVAL_MS || '300000'),
};
