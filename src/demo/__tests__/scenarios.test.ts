import { describe, expect, it } from 'vitest';
import { validateGraph } from '@/domain/graph';
import type { CatalogContext } from '@/domain/nodeRegistry';
import { parseDraft } from '@/domain/serialization';
import { MOCK_LISTS, MOCK_TEMPLATES } from '@/api/mockData';
import { WORKSPACE_IDS } from '@/demo/ids';
import { SCENARIOS } from '@/demo/scenarios';

const ctx: CatalogContext = {
  workspaceId: WORKSPACE_IDS.passengerStaging,
  lists: MOCK_LISTS,
  templates: MOCK_TEMPLATES,
  catalogsReady: true,
  foreignListIds: new Set(
    MOCK_LISTS.filter((list) => list.workspaceId !== WORKSPACE_IDS.passengerStaging).map((l) => l.id),
  ),
  foreignTemplateIds: new Set(
    MOCK_TEMPLATES.filter((t) => t.workspaceId !== WORKSPACE_IDS.passengerStaging).map((t) => t.id),
  ),
};

describe('scenario fixtures', () => {
  it('has unique deterministic ids', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(15);
  });

  for (const scenario of SCENARIOS) {
    it(`matches its expected validation result: ${scenario.id}`, () => {
      const payload = scenario.payload();
      if (payload.kind === 'unsupported') {
        const parsed = parseDraft(payload.definition);
        expect(parsed.ok).toBe(false);
        if (!parsed.ok) {
          expect(parsed.issues.map((issue) => issue.code)).toContain('SCHEMA_UNSUPPORTED');
        }
        expect(scenario.publishable).toBe(false);
        return;
      }

      const result = validateGraph(payload.draft, ctx);
      const foundCodes = result.issues.map((issue) => issue.code);
      for (const code of scenario.expectedErrorCodes) {
        expect(foundCodes, `${scenario.id} should include ${code}`).toContain(code);
      }
      for (const code of scenario.expectedWarningCodes) {
        expect(foundCodes, `${scenario.id} should include warning ${code}`).toContain(code);
      }
      expect(result.errors.some((issue) => issue.severity === 'error')).toBe(!scenario.publishable);
      expect(result.valid).toBe(scenario.publishable);
    });
  }
});
