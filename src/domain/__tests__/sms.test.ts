import { describe, expect, it } from 'vitest';
import {
  estimateSegments,
  extractTemplateVariables,
  reconcileMappings,
  renderPreview,
} from '../sms';

describe('extractTemplateVariables', () => {
  it('returns unique variables in order', () => {
    expect(extractTemplateVariables('Hi {{firstName}} {{ firstName }} {{code}}')).toEqual([
      'firstName',
      'code',
    ]);
  });
});

describe('renderPreview', () => {
  it('renders mapped contact fields and literals', () => {
    const preview = renderPreview(
      'Hi {{firstName}}, code {{code}}',
      {
        firstName: { kind: 'contact', field: 'firstName' },
        code: { kind: 'literal', value: 'MARCO20' },
      },
      { firstName: 'Sara' },
    );
    expect(preview.plainText).toBe('Hi Sara, code MARCO20');
    expect(preview.unresolvedVariables).toEqual([]);
  });

  it('keeps unresolved placeholders and reports missing preview values', () => {
    const preview = renderPreview(
      'Hi {{firstName}} {{lastName}} {{unknown}}',
      {
        firstName: { kind: 'contact', field: 'firstName' },
        lastName: { kind: 'contact', field: 'lastName' },
      },
      { firstName: 'Sara', lastName: null },
    );
    expect(preview.unresolvedVariables).toEqual(['unknown']);
    expect(preview.missingPreviewFields).toEqual(['lastName']);
    expect(preview.plainText).toContain('{{unknown}}');
    expect(preview.tokens.some((token) => token.kind === 'missing')).toBe(true);
  });

  it('never produces HTML', () => {
    const preview = renderPreview('<b>{{firstName}}</b>', {
      firstName: { kind: 'literal', value: '<script>alert(1)</script>' },
    });
    expect(preview.tokens.every((token) => token.kind !== 'text' || !token.text.includes('<script>'))).toBe(
      false,
    );
    // The literal is returned as text tokens; the UI renders it as text, never HTML.
    expect(preview.plainText).toContain('<script>');
  });
});

describe('estimateSegments', () => {
  it('uses GSM-7 for plain text', () => {
    expect(estimateSegments('a'.repeat(160))).toMatchObject({
      encoding: 'GSM-7',
      segments: 1,
      multipart: false,
    });
    expect(estimateSegments('a'.repeat(161))).toMatchObject({
      encoding: 'GSM-7',
      segments: 2,
      multipart: true,
    });
  });

  it('counts GSM extension characters as two septets', () => {
    expect(estimateSegments('€'.repeat(80))).toMatchObject({ units: 160, segments: 1 });
    expect(estimateSegments('€'.repeat(81))).toMatchObject({ units: 162, segments: 2 });
  });

  it('switches to UCS-2 for non-GSM characters', () => {
    expect(estimateSegments('سلام')).toMatchObject({ encoding: 'UCS-2', segments: 1 });
    expect(estimateSegments('😀')).toMatchObject({ encoding: 'UCS-2', units: 2, segments: 1 });
    expect(estimateSegments('😀'.repeat(35))).toMatchObject({ units: 70, segments: 1 });
    expect(estimateSegments('😀'.repeat(36))).toMatchObject({ units: 72, segments: 2 });
  });
});

describe('reconcileMappings', () => {
  it('keeps compatible mappings and reports removed ones', () => {
    const result = reconcileMappings(
      {
        firstName: { kind: 'contact', field: 'firstName' },
        driverName: { kind: 'contact', field: 'lastName' },
      },
      ['firstName'],
    );
    expect(Object.keys(result.mappings)).toEqual(['firstName']);
    expect(result.removed).toEqual(['driverName']);
  });
});
