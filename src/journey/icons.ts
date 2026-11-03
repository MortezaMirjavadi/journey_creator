export const NODE_GLYPHS = {
  'entry.static_list': '◉',
  'action.sms': '▤',
  start: '▶',
  split: '⑂',
  sendSms: '✉',
  waitForEvent: '⏱',
  end: '□',
} as const;

export function categoryClass(category: 'entry' | 'action' | 'terminal'): string {
  return category === 'entry' ? 'start' : category === 'action' ? 'send' : 'end';
}
