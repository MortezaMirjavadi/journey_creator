import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockBehavior, setMockBehavior } from '@/api/mockBehavior';
import { emptyDraft } from '@/domain/serialization';
import type { JourneyDraft } from '@/domain/types';
import { LIST_IDS, TEMPLATE_IDS, WORKSPACE_IDS } from '@/demo/ids';
import { minimalValidDraft, unsupportedDefinition } from '@/demo/fixtures';
import { SandboxJourneyApi } from '@/demo/sandboxApi';
import { EditorSession } from '../session';

const WS = WORKSPACE_IDS.passengerStaging;

async function createSession(
  definition: unknown = emptyDraft(),
  options: { readOnly?: boolean; status?: 'draft' | 'published' } = {},
) {
  const api = new SandboxJourneyApi(WS, 'sandbox_test', {
    definition,
    readOnly: options.readOnly,
    status: options.status,
  });
  const session = new EditorSession({
    api,
    workspaceId: WS,
    journeyId: 'sandbox_test',
    sandbox: true,
    autosaveDelayMs: 60_000,
  });
  await session.load();
  await vi.waitFor(() => {
    expect(session.getState().catalogs.lists.status).toBe('ready');
    expect(session.getState().catalogs.templates.status).toBe('ready');
  });
  return { session, api };
}

function configureValidJourney(session: EditorSession) {
  const entryId = session.addNode('entry.static_list', { x: 0, y: 0 });
  const smsId = session.addNode('action.sms', { x: 0, y: 170 });
  const endId = session.addNode('end', { x: 0, y: 340 });
  expect(entryId && smsId && endId).toBeTruthy();
  expect(session.connect(entryId!, smsId!, 'next')).toBe(true);
  expect(session.connect(smsId!, endId!, 'success')).toBe(true);
  session.updateNodeConfig(entryId!, { label: '', listId: LIST_IDS.psAll });
  session.updateNodeConfig(smsId!, {
    label: '',
    templateVersionId: TEMPLATE_IDS.psWelcome,
    variableMappings: { firstName: { kind: 'contact', field: 'firstName' } },
  });
  return { entryId: entryId!, smsId: smsId!, endId: endId! };
}

beforeEach(() => {
  resetMockBehavior();
  setMockBehavior({ latencyMs: 0 });
});

afterEach(() => {
  resetMockBehavior();
});

describe('EditorSession', () => {
  it('runs the full happy path: build, validate, save, publish, read-only', async () => {
    const { session } = await createSession();
    expect(session.getState().page).toBe('ready');
    expect(session.getState().readOnly).toBe(false);

    const { smsId } = configureValidJourney(session);
    expect(session.getState().dirty).toBe(true);

    const validation = await session.validate();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    await session.save(true);
    expect(session.getState().saveState).toBe('saved');
    expect(session.getState().dirty).toBe(false);
    expect(session.getState().document?.revision).toBe(2);

    await session.publish();
    expect(session.getState().publishState).toBe('published');
    expect(session.getState().publishedVersion?.versionNumber).toBe(1);
    expect(session.getState().readOnly).toBe(true);
    expect(session.getState().readOnlyReason).toBe('published');

    expect(session.addNode('action.sms', { x: 0, y: 0 })).toBeNull();
    expect(
      session.updateNodeConfig(smsId, {
        label: 'Changed',
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: {},
      }),
    ).toBe(false);
    await session.save(true);
    expect(session.getState().saveState).toBe('clean');
  });

  it('saves incomplete drafts', async () => {
    const { session } = await createSession(emptyDraft());
    session.addNode('entry.static_list', { x: 0, y: 0 });
    expect(session.getState().validation.valid).toBe(false);
    await session.save(true);
    expect(session.getState().saveState).toBe('saved');
    expect(session.getState().dirty).toBe(false);
  });

  it('blocks publication when validation fails', async () => {
    const { session } = await createSession(emptyDraft());
    await session.publish();
    expect(session.getState().publishState).toBe('validation_failed');
    expect(session.getState().publishedVersion).toBeUndefined();
  });

  it('surfaces save errors and retries successfully', async () => {
    const { session } = await createSession();
    session.addNode('entry.static_list', { x: 0, y: 0 });
    setMockBehavior({ failNextSave: true });
    await session.save(true);
    expect(session.getState().saveState).toBe('error');
    expect(session.getState().saveError).toContain('Saving failed');

    await session.save(true);
    expect(session.getState().saveState).toBe('saved');
    expect(session.getState().dirty).toBe(false);
  });

  it('handles revision conflicts and reloads the server draft', async () => {
    const { session } = await createSession();
    session.addNode('entry.static_list', { x: 0, y: 0 });
    setMockBehavior({ conflictNextSave: true });
    await session.save(true);
    expect(session.getState().saveState).toBe('conflict');
    expect(session.getState().conflict?.currentRevision).toBe(1);

    await session.reload();
    expect(session.getState().page).toBe('ready');
    expect(session.getState().dirty).toBe(false);
    expect(session.getState().draft.nodes).toHaveLength(0);
  });

  it('does not mark the draft clean when newer edits remain unsaved', async () => {
    const { session } = await createSession();
    setMockBehavior({ latencyMs: 40 });
    session.addNode('entry.static_list', { x: 0, y: 0 });
    const saving = session.save(true);
    session.addNode('action.sms', { x: 0, y: 170 });
    await saving;
    expect(session.getState().dirty).toBe(true);
    expect(session.getState().saveState).toBe('dirty');
  });

  it('keeps edits when switching selection', async () => {
    const { session } = await createSession();
    const first = session.addNode('action.sms', { x: 0, y: 0 })!;
    const second = session.addNode('action.sms', { x: 0, y: 170 })!;
    const firstNode = session.getState().draft.nodes.find((node) => node.id === first)!;
    session.updateNodeConfig(first, { ...firstNode.config, label: 'First' });
    session.selectNode(second);
    const secondNode = session.getState().draft.nodes.find((node) => node.id === second)!;
    session.updateNodeConfig(second, { ...secondNode.config, label: 'Second' });
    const firstAfter = session.getState().draft.nodes.find((node) => node.id === first)!;
    expect(firstAfter.config.label).toBe('First');
  });

  it('prevents invalid connections interactively', async () => {
    const { session } = await createSession();
    const entry = session.addNode('entry.static_list', { x: 0, y: 0 })!;
    const sms = session.addNode('action.sms', { x: 0, y: 170 })!;
    const end = session.addNode('end', { x: 0, y: 340 })!;
    expect(session.connect(entry, sms, 'next')).toBe(true);
    expect(session.connect(entry, end, 'next')).toBe(false); // entry already has an output
    expect(session.connect(sms, sms, 'success')).toBe(false); // self connection
    expect(session.connect(sms, end, 'bogus')).toBe(false); // invalid handle
    expect(session.connect(sms, end, 'success')).toBe(true);
    expect(session.connect(sms, end, 'success')).toBe(false); // duplicate
  });

  it('deletes nodes and incident edges atomically', async () => {
    const { session } = await createSession();
    const { smsId } = configureValidJourney(session);
    expect(session.getState().draft.edges).toHaveLength(2);
    session.removeNodes([smsId]);
    expect(session.getState().draft.nodes).toHaveLength(2);
    expect(session.getState().draft.edges).toHaveLength(0);
  });

  it('duplicates SMS nodes but not entry or end nodes', async () => {
    const { session } = await createSession();
    const entry = session.addNode('entry.static_list', { x: 0, y: 0 })!;
    const sms = session.addNode('action.sms', { x: 0, y: 170 })!;
    const end = session.addNode('end', { x: 0, y: 340 })!;
    expect(session.duplicateNode(entry)).toBeNull();
    expect(session.duplicateNode(end)).toBeNull();
    const copy = session.duplicateNode(sms);
    expect(copy).not.toBeNull();
    expect(copy).not.toBe(sms);
    expect(session.getState().draft.nodes).toHaveLength(4);
  });

  it('supports undo and redo for document changes', async () => {
    const { session } = await createSession();
    session.addNode('entry.static_list', { x: 0, y: 0 });
    expect(session.getState().draft.nodes).toHaveLength(1);
    session.undo();
    expect(session.getState().draft.nodes).toHaveLength(0);
    session.redo();
    expect(session.getState().draft.nodes).toHaveLength(1);
  });

  it('is fully read-only when the fixture is read-only', async () => {
    const { session } = await createSession(minimalValidDraft(), { readOnly: true });
    expect(session.getState().readOnly).toBe(true);
    expect(session.addNode('action.sms', { x: 0, y: 0 })).toBeNull();
    expect(session.getState().draft.nodes).toHaveLength(3);
    await session.save(true);
    expect(session.getState().saveState).toBe('clean');
    await session.publish();
    expect(session.getState().publishState).toBe('idle');
  });

  it('reports unsupported documents instead of dropping data', async () => {
    const api = new SandboxJourneyApi(WS, 'sandbox_unsupported', {
      definition: unsupportedDefinition(),
      readOnly: true,
    });
    const session = new EditorSession({
      api,
      workspaceId: WS,
      journeyId: 'sandbox_unsupported',
      sandbox: true,
    });
    await session.load();
    expect(session.getState().page).toBe('unsupported');
    expect(session.getState().unsupported?.issues.map((issue) => issue.code)).toContain(
      'SCHEMA_UNSUPPORTED',
    );
  });

  it('ignores async results after disposal (workspace change / unmount)', async () => {
    setMockBehavior({ latencyMs: 40 });
    const api = new SandboxJourneyApi(WS, 'sandbox_stale', { definition: emptyDraft() });
    const session = new EditorSession({
      api,
      workspaceId: WS,
      journeyId: 'sandbox_stale',
      sandbox: true,
    });
    const loading = session.load();
    session.dispose();
    await loading;
    expect(session.getState().page).toBe('loading');
  });

  it('keeps sandbox examples isolated from persisted mock journeys', async () => {
    localStorage.removeItem('marco.mock.journeys.v1');
    const { session } = await createSession(minimalValidDraft());
    await session.save(true);
    expect(localStorage.getItem('marco.mock.journeys.v1')).toBeNull();
  });

  it('auto-layouts without changing the graph semantics', async () => {
    const { session } = await createSession();
    configureValidJourney(session);
    const before = session.getState().draft;
    session.autoLayout();
    const after = session.getState().draft;
    expect(after.nodes).toEqual(before.nodes);
    expect(after.edges).toEqual(before.edges);
    expect(after.layout).not.toEqual(before.layout);
  });

  it('edits and persists node, edge, and journey metadata', async () => {
    const { session } = await createSession();
    const { entryId } = configureValidJourney(session);
    const edgeId = session.getState().draft.edges[0].id;

    expect(session.updateNodeMeta(entryId, { owner: 'growth', tags: ['vip'] })).toBe(true);
    expect(session.updateEdgeMeta(edgeId, { primary: true })).toBe(true);
    expect(session.updateDraftMeta({ campaign: 'q4', version: 2 })).toBe(true);

    expect(session.getState().draft.nodes.find((node) => node.id === entryId)?.meta).toEqual({
      owner: 'growth',
      tags: ['vip'],
    });
    expect(session.getState().draft.edges[0].meta).toEqual({ primary: true });
    expect(session.getState().draft.meta).toEqual({ campaign: 'q4', version: 2 });

    await session.save(true);
    expect(session.getState().saveState).toBe('saved');

    await session.reload();
    expect(session.getState().draft.meta).toEqual({ campaign: 'q4', version: 2 });
    expect(session.getState().draft.nodes.find((node) => node.id === entryId)?.meta).toEqual({
      owner: 'growth',
      tags: ['vip'],
    });
    expect(session.getState().draft.edges[0].meta).toEqual({ primary: true });
  });

  it('removes metadata cleanly and restores it with undo', async () => {
    const { session } = await createSession();
    const { entryId } = configureValidJourney(session);
    session.updateNodeMeta(entryId, { owner: 'growth' });
    session.updateNodeMeta(entryId, undefined);
    expect(session.getState().draft.nodes.find((node) => node.id === entryId)).not.toHaveProperty('meta');
    session.undo();
    expect(session.getState().draft.nodes.find((node) => node.id === entryId)?.meta).toEqual({
      owner: 'growth',
    });
  });

  it('does not add selection or viewport changes to undo history', async () => {
    const { session } = await createSession();
    session.addNode('entry.static_list', { x: 0, y: 0 });
    const canUndoBefore = session.getState().history.canUndo;
    session.selectNode('entry_1');
    session.clearSelection();
    expect(session.getState().history.canUndo).toBe(canUndoBefore);
  });
});

describe('draft contract', () => {
  it('keeps layout in the document but not selection', async () => {
    const { session } = await createSession();
    const id = session.addNode('entry.static_list', { x: 12, y: 34 })!;
    const draft: JourneyDraft = session.getState().draft;
    expect(draft.layout[id]).toEqual({ x: 12, y: 34 });
    expect(JSON.stringify(draft)).not.toContain('selected');
  });
});
