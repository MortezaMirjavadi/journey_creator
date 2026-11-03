import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { NODE_REGISTRY } from '@/domain/nodeRegistry';
import { cn } from '@/utils/cn';
import type { JourneyFlowNode } from './flowAdapter';
import { NODE_GLYPHS, categoryClass } from './icons';

function NodeCard({ id, data, selected }: NodeProps<JourneyFlowNode>) {
  const { t } = useTranslation();
  const definition = NODE_REGISTRY[data.node.type];
  const category = categoryClass(definition.category);
  const hasError = data.issues.some((issue) => issue.severity === 'error');
  const first = data.summary[0];
  const summary = first ? t(first.key, first.params) : t('summary.terminal');
  const empty = summary.length === 0;

  return (
    <div
      className={cn(
        'canvas-node',
        category,
        selected && 'selected',
        hasError && 'invalid',
      )}
      data-node-id={id}
    >
      {definition.inputPorts.map((port) => (
        <Handle
          key={port.id}
          type="target"
          position={Position.Top}
          id={port.id}
          isConnectable={!data.readOnly}
          aria-label={t(port.labelKey)}
        />
      ))}

      <div className="node-top">
        <span className={`node-icon ${category}`} aria-hidden>
          {NODE_GLYPHS[data.node.type]}
        </span>
        <span className="node-type">{t(definition.labelKey)}</span>
      </div>
      <strong className={empty ? 'node-summary-empty' : undefined}>{summary}</strong>
      <small>{id}</small>

      {definition.outputPorts.map((port, index) => (
        <Handle
          key={port.id}
          type="source"
          position={Position.Bottom}
          id={port.id}
          isConnectable={!data.readOnly}
          aria-label={t(port.labelKey)}
          title={t(port.labelKey)}
          style={
            definition.outputPorts.length > 1
              ? { left: `${((index + 1) / (definition.outputPorts.length + 1)) * 100}%` }
              : undefined
          }
        />
      ))}
    </div>
  );
}

export function EntryNodeCard(props: NodeProps<JourneyFlowNode>) {
  return <NodeCard {...props} />;
}

export function SmsNodeCard(props: NodeProps<JourneyFlowNode>) {
  return <NodeCard {...props} />;
}

export function EndNodeCard(props: NodeProps<JourneyFlowNode>) {
  return <NodeCard {...props} />;
}

export function StartNodeCard(props: NodeProps<JourneyFlowNode>) {
  return <NodeCard {...props} />;
}

export function SplitNodeCard(props: NodeProps<JourneyFlowNode>) {
  return <NodeCard {...props} />;
}

export function SendSmsNodeCard(props: NodeProps<JourneyFlowNode>) {
  return <NodeCard {...props} />;
}

export function WaitForEventNodeCard(props: NodeProps<JourneyFlowNode>) {
  return <NodeCard {...props} />;
}

export const nodeTypes = {
  'entry.static_list': EntryNodeCard,
  'action.sms': SmsNodeCard,
  start: StartNodeCard,
  split: SplitNodeCard,
  sendSms: SendSmsNodeCard,
  waitForEvent: WaitForEventNodeCard,
  end: EndNodeCard,
} satisfies NodeTypes;
