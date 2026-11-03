import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { resetMockBehavior, setMockBehavior } from '@/api/mockBehavior';
import { emptyDraft } from '@/domain/serialization';
import { LIST_IDS, TEMPLATE_IDS, WORKSPACE_IDS } from '@/demo/ids';
import { SandboxJourneyApi } from '@/demo/sandboxApi';
import { EditorProvider } from '@/editor/EditorContext';
import { EditorSession } from '@/editor/session';
import { PropertiesPanel } from '../PropertiesPanel';

const WS = WORKSPACE_IDS.passengerStaging;

async function createSession(readOnly = false) {
  const api = new SandboxJourneyApi(WS, 'sandbox_props', {
    definition: emptyDraft(),
    readOnly,
  });
  const session = new EditorSession({
    api,
    workspaceId: WS,
    journeyId: 'sandbox_props',
    sandbox: true,
    autosaveDelayMs: 60_000,
  });
  await session.load();
  await vi.waitFor(() => {
    expect(session.getState().catalogs.lists.status).toBe('ready');
    expect(session.getState().catalogs.templates.status).toBe('ready');
  });
  return session;
}

beforeEach(() => {
  resetMockBehavior();
  setMockBehavior({ latencyMs: 0 });
});

afterEach(() => {
  resetMockBehavior();
});

describe('PropertiesPanel', () => {
  it('edits entry list selection and keeps the canvas summary in sync', async () => {
    const session = await createSession();
    const entryId = session.addNode('entry.static_list', { x: 0, y: 0 })!;
    session.selectNode(entryId);
    render(
      <EditorProvider session={session}>
        <PropertiesPanel />
      </EditorProvider>,
    );

    const listSelect = await screen.findByRole('combobox', { name: /Static list/i });
    await userEvent.selectOptions(listSelect, LIST_IDS.psAll);
    const node = session.getState().draft.nodes.find((item) => item.id === entryId)!;
    expect(node.type).toBe('entry.static_list');
    if (node.type === 'entry.static_list') {
      expect(node.config.listId).toBe(LIST_IDS.psAll);
    }
    expect(screen.getByText('All passengers')).toBeInTheDocument();
  });

  it('configures SMS templates and variable mappings', async () => {
    const session = await createSession();
    const smsId = session.addNode('action.sms', { x: 0, y: 0 })!;
    session.selectNode(smsId);
    render(
      <EditorProvider session={session}>
        <PropertiesPanel />
      </EditorProvider>,
    );

    const templateSelect = await screen.findByRole('combobox', { name: /SMS template/i });
    await userEvent.selectOptions(templateSelect, TEMPLATE_IDS.psWelcome);

    const mappingSelect = await screen.findByRole('combobox', { name: /Source: firstName/i });
    await userEvent.selectOptions(mappingSelect, 'firstName');

    const node = session.getState().draft.nodes.find((item) => item.id === smsId)!;
    expect(node.type).toBe('action.sms');
    if (node.type === 'action.sms') {
      expect(node.config).toMatchObject({
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: { firstName: { kind: 'contact', field: 'firstName' } },
      });
    }
    expect(document.body.textContent).toContain('Hi Sara');
  });

  it('edits JSON metadata and rejects invalid JSON', async () => {
    const session = await createSession();
    const smsId = session.addNode('action.sms', { x: 0, y: 0 })!;
    session.selectNode(smsId);
    render(
      <EditorProvider session={session}>
        <PropertiesPanel />
      </EditorProvider>,
    );

    const editor = await screen.findByLabelText('Metadata');
    fireEvent.change(editor, { target: { value: 'not json' } });
    fireEvent.blur(editor);
    expect(await screen.findByText(/valid JSON/i)).toBeInTheDocument();
    expect(session.getState().draft.nodes.find((node) => node.id === smsId)?.meta).toBeUndefined();

    fireEvent.change(editor, { target: { value: '{"owner":"growth","tags":["vip"]}' } });
    fireEvent.blur(editor);
    await waitFor(() => {
      expect(session.getState().draft.nodes.find((node) => node.id === smsId)?.meta).toEqual({
        owner: 'growth',
        tags: ['vip'],
      });
    });
  });

  it('warns before discarding incompatible mappings when the template changes', async () => {
    const session = await createSession();
    const smsId = session.addNode('action.sms', { x: 0, y: 0 })!;
    session.selectNode(smsId);
    session.updateNodeConfig(smsId, {
      label: '',
      templateVersionId: TEMPLATE_IDS.psReminder,
      variableMappings: {
        firstName: { kind: 'contact', field: 'firstName' },
        driverName: { kind: 'contact', field: 'lastName' },
      },
    });
    render(
      <EditorProvider session={session}>
        <PropertiesPanel />
      </EditorProvider>,
    );

    const templateSelect = await screen.findByRole('combobox', { name: /SMS template/i });
    await userEvent.selectOptions(templateSelect, TEMPLATE_IDS.psPromo);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/incompatible variable mapping/i);
    await userEvent.click(screen.getByRole('button', { name: /Change template/i }));

    await waitFor(() => {
      const node = session.getState().draft.nodes.find((item) => item.id === smsId)!;
      expect(node.type).toBe('action.sms');
      if (node.type !== 'action.sms') return;
      expect(node.config.templateVersionId).toBe(TEMPLATE_IDS.psPromo);
      expect(node.config.variableMappings).toEqual({
        firstName: { kind: 'contact', field: 'firstName' },
      });
    });
  });

  it('disables fields in read-only mode', async () => {
    const readOnlyApi = new SandboxJourneyApi(WS, 'sandbox_ro_props', {
      definition: {
        schemaVersion: 1,
        nodes: [
          { id: 'entry_1', type: 'entry.static_list', typeVersion: 1, config: { label: '', listId: '' } },
        ],
        edges: [],
        layout: { entry_1: { x: 0, y: 0 } },
      },
      readOnly: true,
    });
    const readOnlySession = new EditorSession({
      api: readOnlyApi,
      workspaceId: WS,
      journeyId: 'sandbox_ro_props',
      sandbox: true,
    });
    await readOnlySession.load();
    await vi.waitFor(() => {
      expect(readOnlySession.getState().catalogs.lists.status).toBe('ready');
    });
    readOnlySession.selectNode('entry_1');
    render(
      <EditorProvider session={readOnlySession}>
        <PropertiesPanel />
      </EditorProvider>,
    );
    const listSelect = await screen.findByRole('combobox', { name: /Static list/i });
    expect(listSelect).toBeDisabled();
    expect(screen.getByText(/Properties cannot be changed/i)).toBeInTheDocument();
  });
});
