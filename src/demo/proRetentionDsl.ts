import { parseJourneyDsl } from '@/domain/journeyDsl';
import type { JourneyDraft } from '@/domain/types';

/** React-Flow-native journey-dsl-1.0 sample: business fields live in `meta`. */
export const PRO_RETENTION_DSL = {
  $schema: 'https://marco.snapp.ir/schemas/journey-dsl-1.0.json',
  dslVersion: '1.0',
  journey: {
    id: 'jrny_pro_retention',
    name: 'Pro retention',
    workspace: 'passenger_production',
    version: 1,
    status: 'draft',
  },
  nodes: [
    {
      id: 'start',
      type: 'start',
      position: { x: 0, y: 120 },
      data: { ui: { collapsed: false } },
      meta: { label: 'Start: Manual pilot', mode: 'manual' },
    },
    {
      id: 'split',
      type: 'split',
      position: { x: 220, y: 120 },
      data: {},
      meta: { label: 'Split Treatment/Control', controlPercentage: 10 },
    },
    {
      id: 'sms_offer',
      type: 'sendSms',
      position: { x: 440, y: 120 },
      data: {},
      meta: {
        label: 'Send SMS offer',
        channel: 'sms',
        body: 'Renew your Pro subscription with code PRO20.',
        expiryHours: 2,
      },
    },
    {
      id: 'wait_purchase',
      type: 'waitForEvent',
      position: { x: 680, y: 120 },
      data: {},
      meta: {
        label: 'Wait for Pro purchase',
        event: { sourceName: 'pro_purchase', venture: 'pro' },
        maxWait: { value: 2, unit: 'days' },
      },
    },
    {
      id: 'end_success',
      type: 'end',
      position: { x: 940, y: 40 },
      data: {},
      meta: { label: 'End: Successful', result: 'successful' },
    },
    {
      id: 'end_not_success',
      type: 'end',
      position: { x: 940, y: 200 },
      data: {},
      meta: { label: 'End: Not successful', result: 'notSuccessful' },
    },
  ],
  edges: [
    {
      id: 'e:start:next:split',
      source: 'start',
      target: 'split',
      type: 'smoothstep',
      data: { outcome: 'next' },
    },
    {
      id: 'e:split:next:sms_offer',
      source: 'split',
      target: 'sms_offer',
      type: 'smoothstep',
      data: { outcome: 'next' },
    },
    {
      id: 'e:sms_offer:next:wait_purchase',
      source: 'sms_offer',
      target: 'wait_purchase',
      type: 'smoothstep',
      data: { outcome: 'next' },
    },
    {
      id: 'e:wait_purchase:event:end_success',
      source: 'wait_purchase',
      target: 'end_success',
      type: 'smoothstep',
      label: 'Event',
      data: { outcome: 'event' },
    },
    {
      id: 'e:wait_purchase:timeout:end_not_success',
      source: 'wait_purchase',
      target: 'end_not_success',
      type: 'smoothstep',
      label: 'Timeout',
      data: { outcome: 'timeout' },
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export function proRetentionDslDraft(): JourneyDraft {
  const result = parseJourneyDsl(PRO_RETENTION_DSL);
  if (!result.ok) {
    throw new Error(`Pro retention DSL failed to convert: ${result.issues.map((i) => i.code).join(', ')}`);
  }
  return result.draft;
}
