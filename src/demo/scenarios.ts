import type { IssueCode, JourneyDraft } from '@/domain/types';
import {
  branchingMergingDraft,
  cycleDraft,
  disconnectedNodeDraft,
  emptyAudienceDraft,
  minimalValidDraft,
  missingEndDraft,
  missingMappingDraft,
  multipleEntriesDraft,
  multipleSmsDraft,
  publishedDraft,
  unavailableReferencesDraft,
  unconfiguredSmsDraft,
  unsupportedDefinition,
} from './fixtures';
import { emptyDraft } from '@/domain/serialization';
import { proRetentionDslDraft } from './proRetentionDsl';

export type ScenarioPayload =
  | {
      kind: 'draft';
      draft: JourneyDraft;
      status?: 'draft' | 'published';
      readOnly?: boolean;
    }
  | { kind: 'unsupported'; definition: unknown };

export interface ScenarioDefinition {
  id: string;
  /** i18n keys. */
  nameKey: string;
  descriptionKey: string;
  payload: () => ScenarioPayload;
  expectedErrorCodes: IssueCode[];
  expectedWarningCodes: IssueCode[];
  publishable: boolean;
}

const scenario = (
  id: string,
  payload: ScenarioPayload | (() => ScenarioPayload),
  expectedErrorCodes: IssueCode[],
  expectedWarningCodes: IssueCode[],
  publishable: boolean,
): ScenarioDefinition => ({
  id,
  nameKey: `scenarios.${id}.name`,
  descriptionKey: `scenarios.${id}.description`,
  payload: typeof payload === 'function' ? payload : () => payload,
  expectedErrorCodes,
  expectedWarningCodes,
  publishable,
});

export const SCENARIOS: ScenarioDefinition[] = [  scenario(
    'empty',
    () => ({ kind: 'draft', draft: emptyDraft() }),
    ['ENTRY_REQUIRED', 'END_REQUIRED', 'SMS_REQUIRED'],
    [],
    false,
  ),
  scenario(
    'minimal-valid',
    () => ({ kind: 'draft', draft: minimalValidDraft() }),
    [],
    [],
    true,
  ),
  scenario(
    'multiple-sms',
    () => ({ kind: 'draft', draft: multipleSmsDraft() }),
    [],
    [],
    true,
  ),
  scenario(
    'pro-retention',
    () => ({ kind: 'draft', draft: proRetentionDslDraft() }),
    [],
    [],
    true,
  ),
  scenario(
    'unconfigured-sms',
    () => ({ kind: 'draft', draft: unconfiguredSmsDraft() }),
    ['TEMPLATE_REQUIRED'],
    [],
    false,
  ),
  scenario(
    'missing-mapping',
    () => ({ kind: 'draft', draft: missingMappingDraft() }),
    ['VARIABLE_MAPPING_REQUIRED'],
    [],
    false,
  ),
  scenario(
    'empty-audience',
    () => ({ kind: 'draft', draft: emptyAudienceDraft() }),
    [],
    ['LIST_EMPTY'],
    true,
  ),
  scenario(
    'missing-end',
    () => ({ kind: 'draft', draft: missingEndDraft() }),
    ['END_REQUIRED', 'SMS_OUTPUT_REQUIRED'],
    [],
    false,
  ),
  scenario(
    'disconnected',
    () => ({ kind: 'draft', draft: disconnectedNodeDraft() }),
    ['DISCONNECTED_NODE', 'SMS_INPUT_REQUIRED', 'SMS_OUTPUT_REQUIRED'],
    [],
    false,
  ),
  scenario(
    'cycle',
    () => ({ kind: 'draft', draft: cycleDraft() }),
    ['CYCLE_DETECTED', 'MERGING', 'UNREACHABLE_END'],
    [],
    false,
  ),
  scenario(
    'multiple-entries',
    () => ({ kind: 'draft', draft: multipleEntriesDraft() }),
    ['MULTIPLE_ENTRIES', 'MERGING'],
    [],
    false,
  ),
  scenario(
    'branching-merging',
    () => ({ kind: 'draft', draft: branchingMergingDraft() }),
    ['BRANCHING', 'MERGING'],
    [],
    false,
  ),
  scenario(
    'unavailable-refs',
    () => ({ kind: 'draft', draft: unavailableReferencesDraft() }),
    ['LIST_NOT_FOUND', 'TEMPLATE_WRONG_WORKSPACE'],
    [],
    false,
  ),
  scenario(
    'published-readonly',
    () => ({ kind: 'draft', draft: publishedDraft(), status: 'published', readOnly: true }),
    [],
    [],
    true,
  ),
  scenario(
    'unsupported',
    () => ({ kind: 'unsupported', definition: unsupportedDefinition() }),
    ['SCHEMA_UNSUPPORTED'],
    [],
    false,
  ),
];

export const DEFAULT_SCENARIO_ID = 'empty';

/** Synthetic scenario used by the Import JSON flow. Not listed in the gallery. */
export const IMPORTED_SCENARIO: ScenarioDefinition = scenario(
  'imported',
  () => ({ kind: 'draft', draft: emptyDraft() }),
  [],
  [],
  true,
);

export function getScenario(id: string | null | undefined): ScenarioDefinition {
  if (id === 'imported') return IMPORTED_SCENARIO;
  return SCENARIOS.find((item) => item.id === id) ?? SCENARIOS[0];
}