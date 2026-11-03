import type { ContactField, VariableSource } from './types';

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export interface PreviewContact {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Deterministic preview contact. Some fields are intentionally unavailable. */
export const MOCK_PREVIEW_CONTACT: PreviewContact = {
  firstName: 'Sara',
  lastName: null,
  phone: '+1 415 555 0132',
  email: null,
};

export function extractTemplateVariables(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      found.push(name);
    }
  }
  return found;
}

/**
 * Keeps mappings that still apply to the new template and reports the rest so
 * the UI can warn before discarding them.
 */
export function reconcileMappings(
  mappings: Record<string, VariableSource>,
  nextVariables: string[],
): { mappings: Record<string, VariableSource>; removed: string[] } {
  const kept: Record<string, VariableSource> = {};
  const removed: string[] = [];
  for (const [variable, mapping] of Object.entries(mappings)) {
    if (nextVariables.includes(variable)) kept[variable] = mapping;
    else removed.push(variable);
  }
  return { mappings: kept, removed };
}

export type PreviewToken =
  | { kind: 'text'; text: string }
  | { kind: 'unresolved'; variable: string }
  | { kind: 'missing'; field: ContactField };

export interface RenderedPreview {
  tokens: PreviewToken[];
  plainText: string;
  unresolvedVariables: string[];
  missingPreviewFields: ContactField[];
}

export function renderPreview(
  body: string,
  mappings: Record<string, VariableSource>,
  contact: PreviewContact = MOCK_PREVIEW_CONTACT,
): RenderedPreview {
  const tokens: PreviewToken[] = [];
  const unresolved = new Set<string>();
  const missing = new Set<ContactField>();
  let lastIndex = 0;

  PLACEHOLDER.lastIndex = 0;
  for (const match of body.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ kind: 'text', text: body.slice(lastIndex, index) });
    const variable = match[1];
    const mapping = mappings[variable];
    if (!mapping) {
      tokens.push({ kind: 'unresolved', variable });
      unresolved.add(variable);
    } else if (mapping.kind === 'literal') {
      tokens.push({ kind: 'text', text: mapping.value });
    } else {
      const value = contact[mapping.field];
      if (value === undefined || value === null) {
        tokens.push({ kind: 'missing', field: mapping.field });
        missing.add(mapping.field);
      } else {
        tokens.push({ kind: 'text', text: String(value) });
      }
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < body.length) tokens.push({ kind: 'text', text: body.slice(lastIndex) });

  const plainText = tokens
    .map((token) =>
      token.kind === 'text'
        ? token.text
        : token.kind === 'unresolved'
          ? `{{${token.variable}}}`
          : '',
    )
    .join('');

  return {
    tokens,
    plainText,
    unresolvedVariables: [...unresolved],
    missingPreviewFields: [...missing],
  };
}

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENSION = '^{}\\[~]|€\f';

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SegmentEstimate {
  encoding: SmsEncoding;
  /** GSM-7 septets or UCS-2 UTF-16 code units. */
  units: number;
  segments: number;
  multipart: boolean;
}

/**
 * Estimates GSM-7/UCS-2 segmentation. Provider implementations differ slightly;
 * the UI labels this as an estimate.
 */
export function estimateSegments(text: string): SegmentEstimate {
  let units = 0;
  let gsm = true;
  for (const char of text) {
    if (GSM7_BASIC.includes(char)) {
      units += 1;
    } else if (GSM7_EXTENSION.includes(char)) {
      units += 2;
    } else {
      gsm = false;
      break;
    }
  }

  if (gsm) {
    if (units <= 160) return { encoding: 'GSM-7', units, segments: 1, multipart: false };
    let segments = 1;
    let used = 0;
    for (const char of text) {
      const cost = GSM7_EXTENSION.includes(char) ? 2 : 1;
      // An escape pair may never straddle a segment boundary.
      if (used + cost > 153) {
        segments += 1;
        used = 0;
      }
      used += cost;
    }
    return { encoding: 'GSM-7', units, segments, multipart: true };
  }

  let utf16Units = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const surrogatePair = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length;
    utf16Units += surrogatePair ? 2 : 1;
    if (surrogatePair) i += 1;
  }
  if (utf16Units <= 70) {
    return { encoding: 'UCS-2', units: utf16Units, segments: 1, multipart: false };
  }
  let segments = 1;
  let used = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const surrogatePair = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length;
    const cost = surrogatePair ? 2 : 1;
    if (used + cost > 67) {
      segments += 1;
      used = 0;
    }
    used += cost;
    if (surrogatePair) i += 1;
  }
  return { encoding: 'UCS-2', units: utf16Units, segments, multipart: true };
}
