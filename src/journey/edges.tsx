import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, type EdgeTypes } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useEditorSession } from '@/editor/EditorContext';
import type { JourneyFlowEdge } from './flowAdapter';

export function JourneyEdge(props: EdgeProps<JourneyFlowEdge>) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  const port = props.data?.sourcePort ?? '';

  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="edge-label"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 8}px)` }}
        >
          {port}
        </div>
        {!props.data?.readOnly ? (
          <button
            type="button"
            className="edge-remove-btn"
            style={{ transform: `translate(-50%, -50%) translate(${labelX + 18}px, ${labelY}px)` }}
            onClick={() => session.removeEdges([props.id])}
            aria-label={t('canvas.deleteEdgeConfirmTitle')}
            title={t('canvas.deleteEdgeConfirmTitle')}
          >
            ×
          </button>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = {
  journey: JourneyEdge,
} satisfies EdgeTypes;
