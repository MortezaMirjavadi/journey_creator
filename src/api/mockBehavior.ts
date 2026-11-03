export interface MockBehavior {
  latencyMs: number;
  failNextSave: boolean;
  conflictNextSave: boolean;
  failNextPublish: boolean;
  failCatalogs: boolean;
  emptyCatalogs: boolean;
  pageFailure: 'none' | 'not_found' | 'forbidden' | 'network';
  unsupportedDocument: boolean;
}

const STORAGE_KEY = 'marco.mock.behavior.v1';

export const DEFAULT_MOCK_BEHAVIOR: MockBehavior = {
  latencyMs: 180,
  failNextSave: false,
  conflictNextSave: false,
  failNextPublish: false,
  failCatalogs: false,
  emptyCatalogs: false,
  pageFailure: 'none',
  unsupportedDocument: false,
};

export function getMockBehavior(): MockBehavior {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MOCK_BEHAVIOR };
    return { ...DEFAULT_MOCK_BEHAVIOR, ...(JSON.parse(raw) as Partial<MockBehavior>) };
  } catch {
    return { ...DEFAULT_MOCK_BEHAVIOR };
  }
}

export function setMockBehavior(patch: Partial<MockBehavior>): MockBehavior {
  const next = { ...getMockBehavior(), ...patch };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetMockBehavior(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
