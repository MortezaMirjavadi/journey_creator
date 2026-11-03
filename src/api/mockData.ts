import type { JourneyDraft, SmsTemplateVersion, StaticList, Workspace } from '@/domain/types';
import {
  draftOf,
  endNode,
  entryNode,
  minimalValidDraft,
  smsNode,
} from '@/demo/fixtures';
import { JOURNEY_IDS, LIST_IDS, TEMPLATE_IDS, WORKSPACE_IDS } from '@/demo/ids';
import { makeEdge } from '@/domain/graph';
import { emptyDraft } from '@/domain/serialization';

export const MOCK_WORKSPACES: Workspace[] = [
  {
    id: WORKSPACE_IDS.passengerStaging,
    name: 'Passenger Staging',
    role: 'OWNER',
    canEdit: true,
    canPublish: true,
  },
  {
    id: WORKSPACE_IDS.passengerProduction,
    name: 'Passenger Production',
    role: 'ADMIN',
    canEdit: true,
    canPublish: true,
  },
  {
    id: WORKSPACE_IDS.driverStaging,
    name: 'Driver Staging',
    role: 'EDITOR',
    canEdit: true,
    canPublish: true,
  },
  {
    id: WORKSPACE_IDS.driverProduction,
    name: 'Driver Production',
    role: 'VIEWER',
    canEdit: false,
    canPublish: false,
  },
];

export const MOCK_LISTS: StaticList[] = [
  {
    id: LIST_IDS.psAll,
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'All passengers',
    memberCount: 1240,
    updatedAt: '2026-10-28T09:15:00.000Z',
  },
  {
    id: LIST_IDS.psVip,
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'VIP passengers',
    memberCount: 86,
    updatedAt: '2026-10-27T14:40:00.000Z',
  },
  {
    id: LIST_IDS.psEmpty,
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'New signups (empty)',
    memberCount: 0,
    updatedAt: '2026-10-29T07:05:00.000Z',
  },
  {
    id: LIST_IDS.ppAll,
    workspaceId: WORKSPACE_IDS.passengerProduction,
    name: 'All passengers',
    memberCount: 48210,
    updatedAt: '2026-10-26T18:22:00.000Z',
  },
  {
    id: LIST_IDS.ppWeekly,
    workspaceId: WORKSPACE_IDS.passengerProduction,
    name: 'Weekly commuters',
    memberCount: 3120,
    updatedAt: '2026-10-25T11:10:00.000Z',
  },
  {
    id: LIST_IDS.dsAll,
    workspaceId: WORKSPACE_IDS.driverStaging,
    name: 'All drivers',
    memberCount: 640,
    updatedAt: '2026-10-24T08:30:00.000Z',
  },
  {
    id: LIST_IDS.dsOnline,
    workspaceId: WORKSPACE_IDS.driverStaging,
    name: 'Online drivers',
    memberCount: 210,
    updatedAt: '2026-10-31T16:45:00.000Z',
  },
  {
    id: LIST_IDS.dpAll,
    workspaceId: WORKSPACE_IDS.driverProduction,
    name: 'All drivers',
    memberCount: 15200,
    updatedAt: '2026-10-22T12:00:00.000Z',
  },
];

export const MOCK_TEMPLATES: SmsTemplateVersion[] = [
  {
    id: TEMPLATE_IDS.psWelcome,
    templateId: 'tpl_ps_welcome',
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'Passenger welcome',
    versionNumber: 1,
    body: 'Hi {{firstName}}, welcome to Marco! Your account is ready.',
    variables: ['firstName'],
    updatedAt: '2026-10-20T10:00:00.000Z',
  },
  {
    id: TEMPLATE_IDS.psReminder,
    templateId: 'tpl_ps_reminder',
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'Trip reminder',
    versionNumber: 2,
    body: 'Hi {{firstName}}, your trip starts soon. Driver: {{driverName}}.',
    variables: ['firstName', 'driverName'],
    updatedAt: '2026-10-21T10:00:00.000Z',
  },
  {
    id: TEMPLATE_IDS.psPromo,
    templateId: 'tpl_ps_promo',
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'Weekend promo',
    versionNumber: 1,
    body: '{{firstName}}, enjoy 20% off this weekend with code MARCO20.',
    variables: ['firstName'],
    updatedAt: '2026-10-19T10:00:00.000Z',
  },
  {
    id: TEMPLATE_IDS.psEmpty,
    templateId: 'tpl_ps_empty',
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'Empty template',
    versionNumber: 1,
    body: '',
    variables: [],
    updatedAt: '2026-10-18T10:00:00.000Z',
  },
  {
    id: TEMPLATE_IDS.ppWelcome,
    templateId: 'tpl_pp_welcome',
    workspaceId: WORKSPACE_IDS.passengerProduction,
    name: 'Win-back',
    versionNumber: 1,
    body: 'Hi {{firstName}}, we saved your seat. Book again today.',
    variables: ['firstName'],
    updatedAt: '2026-10-17T10:00:00.000Z',
  },
  {
    id: TEMPLATE_IDS.dsWelcome,
    templateId: 'tpl_ds_welcome',
    workspaceId: WORKSPACE_IDS.driverStaging,
    name: 'Driver welcome',
    versionNumber: 1,
    body: 'Hi {{firstName}}, your driver account is active.',
    variables: ['firstName'],
    updatedAt: '2026-10-16T10:00:00.000Z',
  },
  {
    id: TEMPLATE_IDS.dpAnnouncement,
    templateId: 'tpl_dp_announcement',
    workspaceId: WORKSPACE_IDS.driverProduction,
    name: 'Driver announcement',
    versionNumber: 1,
    body: '{{firstName}}, new trips are available in your area.',
    variables: ['firstName'],
    updatedAt: '2026-10-15T10:00:00.000Z',
  },
];

export interface MockJourneySeed {
  workspaceId: string;
  name: string;
  description: string;
  status: 'draft' | 'published';
  definition: JourneyDraft;
  revision: number;
  updatedAt: string;
  latestVersion: { id: string; versionNumber: number; publishedAt: string } | null;
}

const ppReactivationDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.ppAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.ppWelcome,
        variableMappings: { firstName: { kind: 'contact', field: 'firstName' } },
      }),
      smsNode('sms_2', {
        templateVersionId: TEMPLATE_IDS.ppWelcome,
        variableMappings: { firstName: { kind: 'contact', field: 'firstName' } },
      }),
      endNode('end_1'),
    ],
    [
      makeEdge('entry_1', 'next', 'sms_1'),
      makeEdge('sms_1', 'success', 'sms_2'),
      makeEdge('sms_2', 'success', 'end_1'),
    ],
  );

const dpAnnouncementDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.dpAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.dpAnnouncement,
        variableMappings: { firstName: { kind: 'contact', field: 'firstName' } },
      }),
      endNode('end_1'),
    ],
    [makeEdge('entry_1', 'next', 'sms_1'), makeEdge('sms_1', 'success', 'end_1')],
  );

export const MOCK_JOURNEY_SEEDS: Record<string, MockJourneySeed> = {
  [JOURNEY_IDS.psOnboarding]: {
    workspaceId: WORKSPACE_IDS.passengerStaging,
    name: 'Passenger onboarding',
    description: 'Welcome new passengers and tell them their account is ready.',
    status: 'draft',
    definition: minimalValidDraft(),
    revision: 3,
    updatedAt: '2026-10-30T12:00:00.000Z',
    latestVersion: null,
  },
  [JOURNEY_IDS.ppReactivation]: {
    workspaceId: WORKSPACE_IDS.passengerProduction,
    name: 'Passenger win-back',
    description: 'Two SMS steps for passengers who have not booked recently. No wait nodes.',
    status: 'draft',
    definition: ppReactivationDraft(),
    revision: 7,
    updatedAt: '2026-10-31T08:30:00.000Z',
    latestVersion: null,
  },
  [JOURNEY_IDS.dsShift]: {
    workspaceId: WORKSPACE_IDS.driverStaging,
    name: 'Driver shift reminder',
    description: 'Empty draft for the driver staging workspace.',
    status: 'draft',
    definition: emptyDraft(),
    revision: 1,
    updatedAt: '2026-10-31T17:20:00.000Z',
    latestVersion: null,
  },
  [JOURNEY_IDS.dpAnnouncement]: {
    workspaceId: WORKSPACE_IDS.driverProduction,
    name: 'Driver availability announcement',
    description: 'Published announcement snapshot. This view is read-only.',
    status: 'published',
    definition: dpAnnouncementDraft(),
    revision: 2,
    updatedAt: '2026-10-20T09:00:00.000Z',
    latestVersion: {
      id: 'ver_dp_announcement_1',
      versionNumber: 1,
      publishedAt: '2026-10-20T09:00:00.000Z',
    },
  },
};

export function defaultJourneyIdForWorkspace(workspaceId: string): string {
  const found = Object.entries(MOCK_JOURNEY_SEEDS).find(([, seed]) => seed.workspaceId === workspaceId);
  return found?.[0] ?? JOURNEY_IDS.psOnboarding;
}
