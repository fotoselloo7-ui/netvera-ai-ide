/**
 * Converts assistant-suggested JSON into reviewable file edits.
 * Deliberately refuses shell commands, file deletion, and paths outside the project.
 * The user must separately preview and approve every edit in WorkspaceDock.
 */
export type AgentFileOperation = {
  action: 'CREATE_FILE' | 'EDIT_FILE';
  path: string;
  content?: string;
  search?: string;
  replace?: string;
};

export type AgentProposal = {
  id: string;
  provider: string;
  operation: AgentFileOperation;
};

const MAX_JSON_LENGTH = 120_000;
const MAX_OPERATIONS = 20;
const MAX_FILE_LENGTH = 2_000_000;
const CODE_BLOCK = /```(?:json|netvera-operations)\s*([\s\S]*?)```/gi;

function safePath(input: unknown): string | null {
  if (typeof input !== 'string' || !input || input.length > 400) return null;
  const path = input.replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return null;
  const segments = path.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..')) return null;
  if (segments.some((part) => {
    const name = part.toLowerCase();
    return ['.git', 'node_modules', 'target', 'dist', 'build', '.next', '.venv', 'vendor', '.ssh', '.aws', '.openbrowser'].includes(name)
      || (name.startsWith('.env') && name !== '.env.example');
  })) return null;
  return path;
}

export function parseAgentOperation(value: unknown): AgentFileOperation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.action !== 'EDIT_FILE' && candidate.action !== 'CREATE_FILE') return null;
  const path = safePath(candidate.path);
  if (!path) return null;

  const content = typeof candidate.content === 'string' ? candidate.content : undefined;
  const search = typeof candidate.search === 'string' ? candidate.search : undefined;
  const replace = typeof candidate.replace === 'string' ? candidate.replace : undefined;
  if ((content !== undefined && content.length > MAX_FILE_LENGTH)
    || (search !== undefined && search.length > MAX_FILE_LENGTH)
    || (replace !== undefined && replace.length > MAX_FILE_LENGTH)) return null;

  if (candidate.action === 'CREATE_FILE') {
    return content === undefined ? null : { action: 'CREATE_FILE', path, content };
  }
  if (content === undefined && (!search || replace === undefined)) return null;
  if (content !== undefined) return { action: 'EDIT_FILE', path, content };
  return { action: 'EDIT_FILE', path, search, replace };
}

export function parseAgentProposals(
  text: string,
  messageId: string,
  provider: string,
): AgentProposal[] {
  if (!text || text.length > MAX_JSON_LENGTH * 3) return [];
  const matches = [...text.matchAll(CODE_BLOCK)].map((match) => match[1]);
  const inputs = matches.length ? matches : [text.trim()];
  const proposals: AgentProposal[] = [];
  for (const input of inputs) {
    if (!input || input.length > MAX_JSON_LENGTH) continue;
    let payload: unknown;
    try { payload = JSON.parse(input); } catch { continue; }
    if (!payload || typeof payload !== 'object' || !('operations' in payload)) continue;
    const ops = (payload as { operations?: unknown }).operations;
    if (!Array.isArray(ops) || ops.length > MAX_OPERATIONS) continue;
    ops.forEach((entry, index) => {
      const operation = parseAgentOperation(entry);
      if (operation) proposals.push({ id: messageId + ':' + index, provider, operation });
    });
  }
  return proposals;
}

export function calculateProposedContent(operation: AgentFileOperation, before: string | null): string {
  if (operation.action === 'CREATE_FILE') {
    if (before !== null) throw new Error('Dosya zaten var; yeni dosya olarak oluşturulamaz.');
    return operation.content ?? '';
  }
  if (before === null) throw new Error('Düzenlenecek dosya bulunamadı.');
  if (operation.content !== undefined) return operation.content;
  const search = operation.search;
  if (!search || operation.replace === undefined) throw new Error('Değişiklik eksik.');
  const first = before.indexOf(search);
  if (first < 0) throw new Error('Aranan metin dosyada bulunamadı.');
  if (before.indexOf(search, first + search.length) !== -1) {
    throw new Error('Aranan metin birden fazla yerde var; güvenli uygulama için tam dosya önerisi iste.');
  }
  return before.slice(0, first) + operation.replace + before.slice(first + search.length);
}

export const AGENT_EDIT_GUIDANCE = String.raw`Bu görev bir kodlama çalışma alanına ait. Önce sorunu analiz et; dosya değişikliği önereceksen yanıtının sonunda JSON kod bloğu ekle:
```json
{"operations":[{"action":"EDIT_FILE","path":"src/relative-file.ts","search":"eski metin","replace":"yeni metin"}]}
```
Yeni dosya için {"action":"CREATE_FILE","path":"...","content":"tam içerik"} kullan.
RUN_COMMAND, DELETE_FILE veya mutlak dosya yolu önerme. Projeye erişimin olduğunu varsayma: yalnızca aşağıda paylaşılmış dosya içeriğine dayan.
Bunlar yalnızca ÖNERİDİR; diske yazılmaz, kullanıcı önizleyip onaylar.`;
