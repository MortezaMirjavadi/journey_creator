import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { checkConnection } from '@/domain/graph';
import { NODE_REGISTRY, NODE_TYPE_LIST, isNodeType } from '@/domain/nodeRegistry';
import type { NodeType } from '@/domain/types';
import { useEditorSession, useEditorState } from '@/editor/EditorContext';
import { buildCatalogContext } from '@/editor/session';
import { nextFreePosition } from '@/editor/layout';
import { edgeTypes } from './edges';
import { toEditorGraph, type JourneyFlowEdge, type JourneyFlowNode } from './flowAdapter';
import { NODE_GLYPHS, categoryClass } from './icons';
import { nodeTypes } from './nodes';

export const NODE_DRAG_MIME = 'application/x-marco-node';

interface CanvasProps {
  fitViewRef: MutableRefObject<(() => void) | null>;
  viewportRef?: MutableRefObject<(() => { x: number; y: number; zoom: number }) | null>;
}

function CanvasInner({ fitViewRef, viewportRef }: CanvasProps) {
  const { t, i18n } = useTranslation();
  const session = useEditorSession();
  const state = useEditorState();
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();
  const [pendingDelete, setPendingDelete] = useState<{ nodeIds: string[]; edgeIds: string[] } | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fitViewRef.current = () => fitView({ padding: 0.25, duration: 200 });
    return () => {
      fitViewRef.current = null;
    };
  }, [fitView, fitViewRef]);

  useEffect(() => {
    if (!viewportRef) return;
    viewportRef.current = () => getViewport();
    return () => {
      viewportRef.current = null;
    };
  }, [getViewport, viewportRef]);

  const catalogContext = useMemo(() => buildCatalogContext(state), [state]);

  const graph = useMemo(
    () =>
      toEditorGraph(state.draft, {
        summaryFor: (node) => NODE_REGISTRY[node.type].summary(node, catalogContext),
        issues: state.validation.issues,
        readOnly: state.readOnly,
        selectedNodeIds: state.selection.nodeIds,
        selectedEdgeIds: state.selection.edgeIds,
      }),
    [state.draft, state.validation.issues, state.readOnly, state.selection, catalogContext],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<JourneyFlowNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<JourneyFlowEdge>(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      session.setSelection(
        selectedNodes.map((node) => node.id),
        selectedEdges.map((edge) => edge.id),
      );
    },
    [session],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: JourneyFlowNode, draggedNodes: JourneyFlowNode[]) => {
      session.moveNodes(
        Object.fromEntries(draggedNodes.map((node) => [node.id, { ...node.position }])),
      );
    },
    [session],
  );

  const isValidConnection = useCallback(
    (connection: Connection | JourneyFlowEdge) => {
      if (!connection.source || !connection.target) return false;
      if (state.readOnly) return false;
      const port = connection.sourceHandle ?? 'next';
      return checkConnection(state.draft, connection.source, connection.target, port).allowed;
    },
    [state.draft, state.readOnly],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      session.connect(connection.source, connection.target, connection.sourceHandle ?? 'next');
    },
    [session],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (state.readOnly) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void session.save(true);
        return;
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (event.key === 'Escape') {
        session.clearSelection();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const { nodeIds, edgeIds } = state.selection;
        if (nodeIds.length === 0 && edgeIds.length === 0) return;
        event.preventDefault();
        setPendingDelete({ nodeIds, edgeIds });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session, state.readOnly, state.selection]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (state.readOnly) return;
      const type = event.dataTransfer.getData(NODE_DRAG_MIME);
      if (!isNodeType(type)) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      session.addNode(type, { x: position.x - 110, y: position.y - 46 });
    },
    [screenToFlowPosition, session, state.readOnly],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const addFromEmpty = (type: NodeType) => {
    session.addNode(type, nextFreePosition(state.draft));
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.nodeIds.length > 0) session.removeNodes(pendingDelete.nodeIds);
    if (pendingDelete.edgeIds.length > 0) session.removeEdges(pendingDelete.edgeIds);
    setPendingDelete(null);
  };

  return (
    <div
      ref={dropRef}
      className="canvas-viewport"
      onDrop={onDrop}
      onDragOver={onDragOver}
      aria-label={t('canvas.label')}
      id="journey-canvas"
      data-testid="journey-canvas"
    >
      <ReactFlow<JourneyFlowNode, JourneyFlowEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={(_event, node) => session.selectNode(node.id)}
        onEdgeClick={(_event, edge) => session.setSelection([], [edge.id])}
        onPaneClick={() => session.clearSelection()}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Strict}
        connectionLineType={ConnectionLineType.Bezier}
        defaultEdgeOptions={{
          type: 'journey',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#a7a5ba' },
        }}
        nodesDraggable={!state.readOnly}
        nodesConnectable={!state.readOnly}
        deleteKeyCode={null}
        multiSelectionKeyCode={['Meta', 'Shift', 'Control']}
        minZoom={0.3}
        maxZoom={1.6}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: false }}
        aria-label={t('canvas.label')}
        dir={i18n.dir()}
      >
        <Background variant={BackgroundVariant.Dots} gap={14} size={1} color="#d9e4f0" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      <div className="canvas-tools" role="toolbar" aria-label={t('a11y.toolbar')}>
        <button
          type="button"
          onClick={() => session.undo()}
          disabled={!state.history.canUndo || state.readOnly}
          aria-label={t('common.undo')}
          title={t('common.undo')}
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => session.redo()}
          disabled={!state.history.canRedo || state.readOnly}
          aria-label={t('common.redo')}
          title={t('common.redo')}
        >
          ↷
        </button>
        <button
          type="button"
          onClick={() => {
            session.autoLayout();
            requestAnimationFrame(() => fitViewRef.current?.());
          }}
          disabled={state.readOnly || state.draft.nodes.length === 0}
          aria-label={t('common.autoLayout')}
          title={t('common.autoLayout')}
        >
          ▦
        </button>
        <button
          type="button"
          onClick={() => fitViewRef.current?.()}
          aria-label={t('common.fitView')}
          title={t('common.fitView')}
        >
          ⤢
        </button>
      </div>

      {state.draft.nodes.length === 0 ? (
        <div className="canvas-empty">
          <div className="card">
            <h3>{t('canvas.emptyTitle')}</h3>
            <p>{t('canvas.emptyDescription')}</p>
            <div className="actions">
              {NODE_TYPE_LIST.map((type) => {
                const definition = NODE_REGISTRY[type];
                return (
                  <button
                    key={type}
                    type="button"
                    className="secondary small"
                    disabled={state.readOnly}
                    onClick={() => addFromEmpty(type)}
                  >
                    <span className={`node-icon ${categoryClass(definition.category)}`} aria-hidden>
                      {NODE_GLYPHS[type]}
                    </span>{' '}
                    {t(definition.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={
          pendingDelete && pendingDelete.nodeIds.length > 0
            ? t('canvas.deleteConfirmTitle')
            : t('canvas.deleteEdgeConfirmTitle')
        }
        description={
          pendingDelete && pendingDelete.nodeIds.length > 0
            ? t('canvas.deleteConfirmDescription', { count: pendingDelete.nodeIds.length })
            : t('canvas.deleteEdgeConfirmDescription')
        }
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}

export function Canvas({ fitViewRef, viewportRef }: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner fitViewRef={fitViewRef} viewportRef={viewportRef} />
    </ReactFlowProvider>
  );
}
