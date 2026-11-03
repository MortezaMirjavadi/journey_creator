import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY, createNode, defaultConfigFor } from '../nodeRegistry';
import { NODE_TYPES } from '../types';

describe('node registry', () => {
  it('registers exactly the supported MVP node types', () => {
    expect(Object.keys(NODE_REGISTRY).sort()).toEqual([...NODE_TYPES].sort());
  });

  it('exposes metadata, ports, and constraints for every node', () => {
    for (const type of NODE_TYPES) {
      const entry = NODE_REGISTRY[type];
      expect(entry.version).toBe(1);
      expect(entry.labelKey).toMatch(/^nodes\./);
      expect(entry.descriptionKey).toMatch(/^nodes\./);
      expect(entry.configSchema.type).toBe('object');
      expect(entry.constraints.maxIncoming).toBeGreaterThanOrEqual(0);
      expect(entry.constraints.maxOutgoing).toBeGreaterThanOrEqual(0);
    }
  });

  it('defines the expected handles', () => {
    expect(NODE_REGISTRY['entry.static_list'].inputPorts).toHaveLength(0);
    expect(NODE_REGISTRY['entry.static_list'].outputPorts.map((port) => port.id)).toEqual(['next']);
    expect(NODE_REGISTRY['action.sms'].inputPorts.map((port) => port.id)).toEqual(['in']);
    expect(NODE_REGISTRY['action.sms'].outputPorts.map((port) => port.id)).toEqual(['success']);
    expect(NODE_REGISTRY.end.inputPorts.map((port) => port.id)).toEqual(['in']);
    expect(NODE_REGISTRY.end.outputPorts).toHaveLength(0);
  });

  it('marks entry and end as singletons and only SMS as duplicateable', () => {
    expect(NODE_REGISTRY['entry.static_list'].constraints.singleton).toBe(true);
    expect(NODE_REGISTRY.end.constraints.singleton).toBe(true);
    expect(NODE_REGISTRY['action.sms'].constraints.singleton).toBe(false);
    expect(NODE_REGISTRY['action.sms'].constraints.duplicateable).toBe(true);
    expect(NODE_REGISTRY['entry.static_list'].constraints.duplicateable).toBe(false);
    expect(NODE_REGISTRY.end.constraints.duplicateable).toBe(false);
  });

  it('creates independent default configs', () => {
    const first = createNode('action.sms', 'sms_1');
    const second = createNode('action.sms', 'sms_2');
    expect(first).toMatchObject({
      id: 'sms_1',
      type: 'action.sms',
      typeVersion: 1,
      config: { label: '', templateVersionId: '', variableMappings: {} },
    });
    if (first.type === 'action.sms' && second.type === 'action.sms') {
      first.config.variableMappings.firstName = { kind: 'contact', field: 'firstName' };
      expect(second.config.variableMappings).toEqual({});
    }
    expect(defaultConfigFor('end')).toEqual({ label: '', note: '' });
  });
});
