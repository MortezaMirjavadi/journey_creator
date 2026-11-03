import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { EditorSession } from './session';
import type { EditorState } from './types';

const EditorContext = createContext<EditorSession | null>(null);

export function EditorProvider({ session, children }: { session: EditorSession; children: ReactNode }) {
  return <EditorContext.Provider value={session}>{children}</EditorContext.Provider>;
}

export function useEditorSession(): EditorSession {
  const session = useContext(EditorContext);
  if (!session) throw new Error('useEditorSession must be used inside EditorProvider');
  return session;
}

export function useEditorState(): EditorState {
  const session = useEditorSession();
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
