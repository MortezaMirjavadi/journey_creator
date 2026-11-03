import type {
  EndConfig,
  EndNode,
  JourneyNode,
  JourneyNodeConfig,
  NodeCategory,
  NodeType,
  SendSmsNode,
  SmsNode,
  SplitNode,
  StartNode,
  StaticList,
  SmsTemplateVersion,
  ValidationIssue,
  WaitForEventNode,
} from './types';
import { NODE_TYPES } from './types';

export interface PortDefinition {
  id: string;
  /** i18n key for the port label. */
  labelKey: string;
  required: boolean;
}

export interface NodeConstraints {
  /** Only one node of this type may exist. Entry and End are singletons. */
  singleton: boolean;
  maxIncoming: number;
  maxOutgoing: number;
  duplicateable: boolean;
}

export interface CatalogContext {
  workspaceId: string;
  lists: StaticList[];
  templates: SmsTemplateVersion[];
  /** False while catalogs are loading/failed; reference checks are skipped. */
  catalogsReady?: boolean;
  /** Lists known to exist in other workspaces (mock only), used to give a precise error. */
  foreignListIds?: Set<string>;
  foreignTemplateIds?: Set<string>;
}

export interface SummaryPart {
  key: string;
  params?: Record<string, string | number>;
  tone?: 'default' | 'muted' | 'warning' | 'danger';
}

/**
 * A declarative JSON Schema subset mirroring the backend's Ajv schema. Used for
 * structural shape validation only; semantic checks live in `validateConfig`.
 */
export interface ConfigSchema {
  type: 'object';
  required?: string[];
  properties?: Record<
    string,
    { type: 'string' | 'number'; minLength?: number; maxLength?: number; minimum?: number; maximum?: number }
  >;
  additionalProperties?: boolean;
}

export interface NodeRegistryEntry<TType extends NodeType = NodeType> {
  type: TType;
  version: number;
  category: NodeCategory;
  /** i18n keys. */
  labelKey: string;
  descriptionKey: string;
  /** Lucide icon name resolved by the UI layer. */
  icon: string;
  accent: 'entry' | 'action' | 'terminal';
  defaultConfig: Extract<JourneyNode, { type: TType }>['config'];
  configSchema: ConfigSchema;
  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];
  constraints: NodeConstraints;
  /** Configuration shape validation (no catalog access). */
  validateShape(node: JourneyNode): ValidationIssue[];
  /** Semantic validation, including workspace-scoped catalog references. */
  validateConfig(node: JourneyNode, ctx: CatalogContext): ValidationIssue[];
  summary(node: JourneyNode, ctx: CatalogContext): SummaryPart[];
}

export type NodeRegistry = {
  [T in NodeType]: NodeRegistryEntry<T>;
};

const MISSING = (code: ValidationIssue['code'], key: string, field: string): ValidationIssue => ({
  code,
  severity: 'error',
  scope: 'property',
  messageKey: key,
  field,
  params: {},
});

function findList(ctx: CatalogContext, listId: string): StaticList | undefined {
  return ctx.lists.find((list) => list.id === listId);
}

function findTemplate(ctx: CatalogContext, id: string): SmsTemplateVersion | undefined {
  return ctx.templates.find((template) => template.id === id);
}

const entryStaticList: NodeRegistryEntry<'entry.static_list'> = {
  type: 'entry.static_list',
  version: 1,
  category: 'entry',
  labelKey: 'nodes.entry.title',
  descriptionKey: 'nodes.entry.description',
  icon: 'users',
  accent: 'entry',
  defaultConfig: { label: '', listId: '' },
  configSchema: {
    type: 'object',
    properties: { listId: { type: 'string', minLength: 1, maxLength: 128 } },
    required: ['listId'],
    additionalProperties: false,
  },
  inputPorts: [],
  outputPorts: [{ id: 'next', labelKey: 'ports.next', required: true }],
  constraints: { singleton: true, maxIncoming: 0, maxOutgoing: 1, duplicateable: false },
  validateShape(node) {
    const config = node.config as Extract<JourneyNode, { type: 'entry.static_list' }>['config'];
    if (typeof config.listId !== 'string') {
      return [MISSING('LIST_REQUIRED', 'validation.listRequired', 'config.listId')];
    }
    return [];
  },
  validateConfig(node, ctx) {
    const { listId } = node.config as Extract<JourneyNode, { type: 'entry.static_list' }>['config'];
    if (!listId) {
      return [{ ...MISSING('LIST_REQUIRED', 'validation.listRequired', 'config.listId'), severity: 'error' }];
    }
    if (ctx.catalogsReady === false) return [];
    const list = findList(ctx, listId);
    if (!list) {
      if (ctx.foreignListIds?.has(listId)) {
        return [
          {
            code: 'LIST_WRONG_WORKSPACE',
            severity: 'error',
            scope: 'property',
            messageKey: 'validation.listWrongWorkspace',
            field: 'config.listId',
          },
        ];
      }
      return [MISSING('LIST_NOT_FOUND', 'validation.listNotFound', 'config.listId')];
    }
    if (list.workspaceId !== ctx.workspaceId) {
      return [
        {
          code: 'LIST_WRONG_WORKSPACE',
          severity: 'error',
          scope: 'property',
          messageKey: 'validation.listWrongWorkspace',
          field: 'config.listId',
        },
      ];
    }
    if (list.memberCount === 0) {
      return [
        {
          code: 'LIST_EMPTY',
          severity: 'warning',
          scope: 'property',
          messageKey: 'validation.listEmpty',
          field: 'config.listId',
        },
      ];
    }
    return [];
  },
  summary(node, ctx) {
    const { listId } = node.config as Extract<JourneyNode, { type: 'entry.static_list' }>['config'];
    if (!listId) return [{ key: 'summary.missingList', tone: 'warning' }];
    if (ctx.catalogsReady === false) return [{ key: 'summary.catalogLoading', tone: 'muted' }];
    const list = findList(ctx, listId);
    if (!list) return [{ key: 'summary.listUnavailable', params: { id: listId }, tone: 'danger' }];
    if (list.workspaceId !== ctx.workspaceId) {
      return [{ key: 'summary.listUnavailable', params: { id: listId }, tone: 'danger' }];
    }
    const parts: SummaryPart[] = [
      { key: 'summary.listName', params: { name: list.name } },
      { key: 'summary.memberCount', params: { count: list.memberCount }, tone: 'muted' },
    ];
    return parts;
  },
};

const actionSms: NodeRegistryEntry<'action.sms'> = {
  type: 'action.sms',
  version: 1,
  category: 'action',
  labelKey: 'nodes.sms.title',
  descriptionKey: 'nodes.sms.description',
  icon: 'message-square',
  accent: 'action',
  defaultConfig: { label: '', templateVersionId: '', variableMappings: {} },
  configSchema: {
    type: 'object',
    properties: { templateVersionId: { type: 'string', minLength: 1, maxLength: 128 } },
    required: ['templateVersionId'],
    additionalProperties: false,
  },
  inputPorts: [{ id: 'in', labelKey: 'ports.in', required: true }],
  outputPorts: [{ id: 'success', labelKey: 'ports.success', required: true }],
  constraints: { singleton: false, maxIncoming: 1, maxOutgoing: 1, duplicateable: true },
  validateShape(node) {
    if (typeof (node.config as SmsNode['config']).templateVersionId !== 'string') {
      return [
        {
          code: 'TEMPLATE_REQUIRED',
          severity: 'error',
          scope: 'property',
          messageKey: 'validation.templateRequired',
          field: 'config.templateVersionId',
        },
      ];
    }
    return [];
  },
  validateConfig(node, ctx) {
    const config = node.config as SmsNode['config'];
    const issues: ValidationIssue[] = [];
    if (!config.templateVersionId) {
      issues.push({
        code: 'TEMPLATE_REQUIRED',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.templateRequired',
        field: 'config.templateVersionId',
      });
      return issues;
    }
    if (ctx.catalogsReady === false) return issues;
    const template = findTemplate(ctx, config.templateVersionId);
    if (!template) {
      issues.push(
        ctx.foreignTemplateIds?.has(config.templateVersionId)
          ? {
              code: 'TEMPLATE_WRONG_WORKSPACE',
              severity: 'error',
              scope: 'property',
              messageKey: 'validation.templateWrongWorkspace',
              field: 'config.templateVersionId',
            }
          : {
              code: 'TEMPLATE_NOT_FOUND',
              severity: 'error',
              scope: 'property',
              messageKey: 'validation.templateNotFound',
              field: 'config.templateVersionId',
            },
      );
      return issues;
    }
    if (template.workspaceId !== ctx.workspaceId) {
      issues.push({
        code: 'TEMPLATE_WRONG_WORKSPACE',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.templateWrongWorkspace',
        field: 'config.templateVersionId',
      });
      return issues;
    }
    if (template.body.trim().length === 0) {
      issues.push({
        code: 'TEMPLATE_EMPTY',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.templateEmpty',
        field: 'config.templateVersionId',
      });
    }
    for (const variable of template.variables) {
      const mapping = config.variableMappings?.[variable];
      if (!mapping) {
        issues.push({
          code: 'VARIABLE_MAPPING_REQUIRED',
          severity: 'error',
          scope: 'property',
          messageKey: 'validation.variableMappingRequired',
          params: { variable },
          field: `config.variableMappings.${variable}`,
        });
        continue;
      }
      if (mapping.kind === 'literal' && mapping.value.trim().length === 0) {
        issues.push({
          code: 'VARIABLE_MAPPING_INVALID',
          severity: 'error',
          scope: 'property',
          messageKey: 'validation.variableMappingInvalid',
          params: { variable },
          field: `config.variableMappings.${variable}`,
        });
      }
    }
    for (const variable of Object.keys(config.variableMappings ?? {})) {
      if (!template.variables.includes(variable)) {
        issues.push({
          code: 'UNKNOWN_VARIABLE_MAPPING',
          severity: 'warning',
          scope: 'property',
          messageKey: 'validation.unknownVariableMapping',
          params: { variable },
          field: `config.variableMappings.${variable}`,
        });
      }
    }
    return issues;
  },
  summary(node, ctx) {
    const config = node.config as SmsNode['config'];
    if (!config.templateVersionId) {
      return [{ key: 'summary.missingTemplate', tone: 'warning' }];
    }
    if (ctx.catalogsReady === false) return [{ key: 'summary.catalogLoading', tone: 'muted' }];
    const template = findTemplate(ctx, config.templateVersionId);
    if (!template) {
      return [{ key: 'summary.templateUnavailable', params: { id: config.templateVersionId }, tone: 'danger' }];
    }
    if (template.workspaceId !== ctx.workspaceId) {
      return [{ key: 'summary.templateUnavailable', params: { id: config.templateVersionId }, tone: 'danger' }];
    }
    if (template.variables.length > 0) {
      const mapped = template.variables.filter((variable) => config.variableMappings?.[variable]).length;
      const parts: SummaryPart[] = [
        { key: 'summary.templateName', params: { name: template.name } },
        {
          key: 'summary.variableProgress',
          params: { mapped, total: template.variables.length },
          tone: mapped === template.variables.length ? 'muted' : 'warning',
        },
      ];
      return parts;
    }
    return [{ key: 'summary.templateName', params: { name: template.name } }];
  },
};

const start: NodeRegistryEntry<'start'> = {
  type: 'start',
  version: 1,
  category: 'entry',
  labelKey: 'nodes.start.title',
  descriptionKey: 'nodes.start.description',
  icon: 'play',
  accent: 'entry',
  defaultConfig: { label: '', mode: 'manual' },
  configSchema: {
    type: 'object',
    properties: { mode: { type: 'string' } },
    required: ['mode'],
    additionalProperties: false,
  },
  inputPorts: [],
  outputPorts: [{ id: 'next', labelKey: 'ports.next', required: true }],
  constraints: { singleton: true, maxIncoming: 0, maxOutgoing: 1, duplicateable: false },
  validateShape(node) {
    const config = node.config as StartNode['config'];
    if (config.mode !== 'manual' && config.mode !== 'event') {
      return [
        {
          code: 'INVALID_CONFIG',
          severity: 'error',
          scope: 'property',
          messageKey: 'validation.startModeInvalid',
          field: 'config.mode',
        },
      ];
    }
    return [];
  },
  validateConfig() {
    return [];
  },
  summary(node) {
    const config = node.config as StartNode['config'];
    return [{ key: config.mode === 'event' ? 'summary.startEvent' : 'summary.startManual', tone: 'muted' }];
  },
};

const split: NodeRegistryEntry<'split'> = {
  type: 'split',
  version: 1,
  category: 'action',
  labelKey: 'nodes.split.title',
  descriptionKey: 'nodes.split.description',
  icon: 'split',
  accent: 'action',
  defaultConfig: { label: '', controlPercentage: 10 },
  configSchema: {
    type: 'object',
    properties: { controlPercentage: { type: 'number' } },
    required: ['controlPercentage'],
    additionalProperties: false,
  },
  inputPorts: [{ id: 'in', labelKey: 'ports.in', required: true }],
  outputPorts: [{ id: 'next', labelKey: 'ports.next', required: true }],
  constraints: { singleton: false, maxIncoming: 1, maxOutgoing: 1, duplicateable: true },
  validateShape(node) {
    const config = node.config as SplitNode['config'];
    if (
      typeof config.controlPercentage !== 'number' ||
      !Number.isFinite(config.controlPercentage) ||
      config.controlPercentage < 0 ||
      config.controlPercentage > 100
    ) {
      return [
        {
          code: 'INVALID_CONFIG',
          severity: 'error',
          scope: 'property',
          messageKey: 'validation.splitPercentageInvalid',
          field: 'config.controlPercentage',
        },
      ];
    }
    return [];
  },
  validateConfig() {
    return [];
  },
  summary(node) {
    const config = node.config as SplitNode['config'];
    return [{ key: 'summary.splitControl', params: { percentage: config.controlPercentage } }];
  },
};

const sendSms: NodeRegistryEntry<'sendSms'> = {
  type: 'sendSms',
  version: 1,
  category: 'action',
  labelKey: 'nodes.sendSms.title',
  descriptionKey: 'nodes.sendSms.description',
  icon: 'message-square',
  accent: 'action',
  defaultConfig: { label: '', channel: 'sms', body: '', expiryHours: 2 },
  configSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string' },
      body: { type: 'string', minLength: 1 },
      expiryHours: { type: 'number' },
    },
    required: ['channel', 'body'],
    additionalProperties: false,
  },
  inputPorts: [{ id: 'in', labelKey: 'ports.in', required: true }],
  outputPorts: [{ id: 'next', labelKey: 'ports.next', required: true }],
  constraints: { singleton: false, maxIncoming: 1, maxOutgoing: 1, duplicateable: true },
  validateShape(node) {
    const config = node.config as SendSmsNode['config'];
    const issues: ValidationIssue[] = [];
    if (config.channel !== 'sms') {
      issues.push({
        code: 'INVALID_CONFIG',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.sendSmsChannelInvalid',
        field: 'config.channel',
      });
    }
    if (typeof config.body !== 'string' || config.body.trim().length === 0) {
      issues.push({
        code: 'INVALID_CONFIG',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.smsBodyRequired',
        field: 'config.body',
      });
    }
    if (typeof config.expiryHours !== 'number' || !Number.isFinite(config.expiryHours) || config.expiryHours < 0) {
      issues.push({
        code: 'INVALID_CONFIG',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.expiryInvalid',
        field: 'config.expiryHours',
      });
    }
    return issues;
  },
  validateConfig() {
    return [];
  },
  summary(node) {
    const config = node.config as SendSmsNode['config'];
    const body = config.body.trim();
    return [
      {
        key: body ? 'summary.smsBody' : 'summary.missingSmsBody',
        params: { body: body.length > 48 ? `${body.slice(0, 45)}…` : body },
        tone: body ? 'default' : 'warning',
      },
    ];
  },
};

const waitForEvent: NodeRegistryEntry<'waitForEvent'> = {
  type: 'waitForEvent',
  version: 1,
  category: 'action',
  labelKey: 'nodes.waitForEvent.title',
  descriptionKey: 'nodes.waitForEvent.description',
  icon: 'clock',
  accent: 'action',
  defaultConfig: {
    label: '',
    event: { sourceName: '', venture: '' },
    maxWait: { value: 2, unit: 'days' },
  },
  configSchema: {
    type: 'object',
    properties: { event: { type: 'string' }, maxWait: { type: 'string' } },
    required: ['event', 'maxWait'],
    additionalProperties: false,
  },
  inputPorts: [{ id: 'in', labelKey: 'ports.in', required: true }],
  outputPorts: [
    { id: 'event', labelKey: 'ports.event', required: true },
    { id: 'timeout', labelKey: 'ports.timeout', required: true },
  ],
  constraints: { singleton: false, maxIncoming: 1, maxOutgoing: 2, duplicateable: true },
  validateShape(node) {
    const config = node.config as WaitForEventNode['config'];
    const issues: ValidationIssue[] = [];
    if (!config.event?.sourceName?.trim()) {
      issues.push({
        code: 'INVALID_CONFIG',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.eventSourceRequired',
        field: 'config.event.sourceName',
      });
    }
    if (!config.event?.venture?.trim()) {
      issues.push({
        code: 'INVALID_CONFIG',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.eventVentureRequired',
        field: 'config.event.venture',
      });
    }
    if (
      typeof config.maxWait?.value !== 'number' ||
      !Number.isFinite(config.maxWait.value) ||
      config.maxWait.value <= 0
    ) {
      issues.push({
        code: 'INVALID_CONFIG',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.maxWaitInvalid',
        field: 'config.maxWait.value',
      });
    }
    if (config.maxWait?.unit !== 'hours' && config.maxWait?.unit !== 'days') {
      issues.push({
        code: 'INVALID_CONFIG',
        severity: 'error',
        scope: 'property',
        messageKey: 'validation.maxWaitUnitInvalid',
        field: 'config.maxWait.unit',
      });
    }
    return issues;
  },
  validateConfig() {
    return [];
  },
  summary(node) {
    const config = node.config as WaitForEventNode['config'];
    return [
      {
        key: 'summary.waitEvent',
        params: {
          event: config.event?.sourceName || '—',
          value: config.maxWait?.value ?? 0,
          unit: config.maxWait?.unit ?? 'days',
        },
      },
    ];
  },
};

const end: NodeRegistryEntry<'end'> = {
  type: 'end',
  version: 1,
  category: 'terminal',
  labelKey: 'nodes.end.title',
  descriptionKey: 'nodes.end.description',
  icon: 'flag',
  accent: 'terminal',
  defaultConfig: { label: '', note: '' },
  configSchema: {
    type: 'object',
    properties: { result: { type: 'string' } },
    additionalProperties: false,
  },
  inputPorts: [{ id: 'in', labelKey: 'ports.in', required: true }],
  outputPorts: [],
  constraints: { singleton: true, maxIncoming: 1, maxOutgoing: 0, duplicateable: false },
  validateShape(node) {
    const config = node.config as EndNode['config'];
    if (
      config.result !== undefined &&
      config.result !== 'successful' &&
      config.result !== 'notSuccessful'
    ) {
      return [
        {
          code: 'INVALID_CONFIG',
          severity: 'error',
          scope: 'property',
          messageKey: 'validation.endResultInvalid',
          field: 'config.result',
        },
      ];
    }
    return [];
  },
  validateConfig() {
    return [];
  },
  summary(node) {
    const config = node.config as EndConfig;
    if (config.result) {
      return [
        {
          key: config.result === 'successful' ? 'summary.endSuccessful' : 'summary.endNotSuccessful',
          tone: config.result === 'successful' ? 'default' : 'muted',
        },
      ];
    }
    const note = config.note?.trim();
    return note
      ? [{ key: 'summary.endNote', params: { note: note.length > 60 ? `${note.slice(0, 57)}…` : note } }]
      : [{ key: 'summary.terminal', tone: 'muted' }];
  },
};

export const NODE_REGISTRY: NodeRegistry = {
  'entry.static_list': entryStaticList,
  'action.sms': actionSms,
  start,
  split,
  sendSms,
  waitForEvent,
  end,
};

export const NODE_TYPE_LIST: NodeType[] = [...NODE_TYPES];

export function isNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && (NODE_TYPES_SET as Set<string>).has(value);
}

const NODE_TYPES_SET = new Set<string>(NODE_TYPE_LIST);

export function registryEntry<T extends NodeType>(type: T): NodeRegistry[T] {
  return NODE_REGISTRY[type];
}

/** Centralized node factory. Only place that knows how to build default nodes. */
export function createNode(type: NodeType, id: string): JourneyNode {
  const entry = NODE_REGISTRY[type];
  return {
    id,
    type,
    typeVersion: entry.version,
    config: structuredClone(entry.defaultConfig),
  } as JourneyNode;
}

export function defaultConfigFor(type: NodeType): JourneyNodeConfig {
  return structuredClone(NODE_REGISTRY[type].defaultConfig);
}
