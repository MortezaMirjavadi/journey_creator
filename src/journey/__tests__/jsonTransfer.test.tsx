import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { PRO_RETENTION_DSL } from '@/demo/proRetentionDsl';
import { ImportJsonModal } from '../JsonTransferModals';

describe('ImportJsonModal', () => {
  it('imports a React-Flow-native journey-dsl document', () => {
    const onImported = vi.fn();
    render(<ImportJsonModal open onOpenChange={() => {}} onImported={onImported} />);

    fireEvent.change(screen.getByLabelText('JSON document'), {
      target: { value: JSON.stringify(PRO_RETENTION_DSL) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load into sandbox' }));

    expect(onImported).toHaveBeenCalledTimes(1);
    const draft = onImported.mock.calls[0][0];
    expect(draft.nodes).toHaveLength(6);
    expect(draft.edges).toHaveLength(5);
    expect(draft.nodes.find((node: { id: string }) => node.id === 'wait_purchase')?.config).toMatchObject({
      event: { sourceName: 'pro_purchase', venture: 'pro' },
    });
  });

  it('shows structured errors for invalid JSON', () => {
    const onImported = vi.fn();
    render(<ImportJsonModal open onOpenChange={() => {}} onImported={onImported} />);

    fireEvent.change(screen.getByLabelText('JSON document'), {
      target: { value: '{ not json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load into sandbox' }));

    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByText('JSON_INVALID')).toBeInTheDocument();
  });
});
