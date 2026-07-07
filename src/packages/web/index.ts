// #WebUI — public surface of the web package.
export {
  WebController, ENV_HINTS, TOUR_CATEGORIES,
  type WebControllerOptions, type ChatMessage, type TutorialSources,
  type TutorialManifestEntry, type ContinuousVoicePort, type ContinuousVoiceHandlers,
} from './controller.ts';
export { detectFormat } from '@tamedtable/file-io';
export {
  DiagnosticsManager, redactValue, evictEvents, buildReportMarkdown,
  MAX_EVENTS, MAX_BYTES, MAX_BODY, type DiagEvent, type DiagLevel,
} from './controller-diagnostics.ts';
