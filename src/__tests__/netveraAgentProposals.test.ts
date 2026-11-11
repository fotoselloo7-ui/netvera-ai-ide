import { describe, expect, it } from 'vitest';
import { calculateProposedContent, parseAgentProposals } from '../netvera/agentProposals';

describe('NetVera agent proposal review', () => {
  it('accepts a specific edit from a fenced JSON answer', () => {
    const input = 'Önerim:\n' + '```json\n{"operations":[{"action":"EDIT_FILE","path":"src/a.ts","search":"let a=1","replace":"let a=2"}]}\n```';
    const items = parseAgentProposals(input, 'answer1', 'claude');
    expect(items).toHaveLength(1);
    expect(calculateProposedContent(items[0].operation, 'let a=1')).toBe('let a=2');
  });

  it('rejects commands, deletion, traversal and secret files', () => {
    const items = parseAgentProposals(JSON.stringify({ operations: [
      { action: 'RUN_COMMAND', command: 'del /s /q *' },
      { action: 'DELETE_FILE', path: 'src/a.ts' },
      { action: 'EDIT_FILE', path: '../outside', content: 'x' },
      { action: 'EDIT_FILE', path: '.env', content: 'x' },
      { action: 'EDIT_FILE', path: '.git/config', content: 'x' },
      { action: 'CREATE_FILE', path: 'src/ok.ts', content: 'ok' },
    ] }), 'id', 'chatgpt');
    expect(items).toHaveLength(1);
    expect(items[0].operation.path).toBe('src/ok.ts');
  });

  it('refuses ambiguous search and existing target file creation', () => {
    const edit = { action: 'EDIT_FILE' as const, path: 'src/a.ts', search: 'x', replace: 'y' };
    expect(() => calculateProposedContent(edit, 'x x')).toThrow();
    expect(() => calculateProposedContent({ action: 'CREATE_FILE', path: 'a.ts', content: 'ok' }, 'old')).toThrow();
  });
});
