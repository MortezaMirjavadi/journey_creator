import { HttpJourneyApi } from './httpAdapter';
import { MockJourneyApi } from './mockAdapter';
import type { JourneyApi } from './types';

export function createJourneyApi(): JourneyApi {
  const mode = import.meta.env.VITE_MARCO_API_MODE ?? 'mock';
  return mode === 'http' ? new HttpJourneyApi() : new MockJourneyApi();
}

export * from './types';
export { MockJourneyApi } from './mockAdapter';
export { HttpJourneyApi } from './httpAdapter';
