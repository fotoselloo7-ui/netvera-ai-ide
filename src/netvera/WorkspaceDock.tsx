import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AGENT_EDIT_GUIDANCE, calculateProposedContent, parseAgentProposals, type AgentProposal } from './agentProposals';

type Entry = { path: string; is_dir: boolean };
type TerminalResult = { exit_code: number | null; stdout: string; stderr: string };
type AssistantMessage = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  provider?: string;
  final?: boolean;
};
type Preview = { proposal: AgentProposal; before: string | null; after: string };

interface WorkspaceDockProps {
  messages: readonly AssistantMessage[];
  onSendTask: (prompt: string) => Promise<boolean>;
  sendDisabled?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export function WorkspaceDock({ messages, onSendTask, sendDisabled = false, onVisibilityChange }: WorkspaceDockProps) {
  const [visible, setVisible] = useState(false);
  const [root, setRoot] = useState('');
  const [activeRoot, setActiveRoot] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState('');
  const [original, setOriginal] = useState('');
  const [content, setContent] = useState('');
  const [task, setTask] = useState('');
  const [command, setCommand] = useState('git status');
  const [terminal, setTerminal] = useState('Terminal hazır. Her komut senin onayınla çalışır.');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);

  const validRoot = Boolean(activeRoot && activeRoot === root.trim());
  const dirty = selected !== '' && content !== original;
  const files = useMemo(() => entries.filter((entry) => !entry.is_dir), [entries]);
  const proposals = useMemo(() => messages
    .filter((msg) => msg.role === 'ai' && msg.final !== false)
    .flatMap((msg) => parseAgentProposals(msg.content, msg.id, msg.provider ?? 'asistan'))
    .slice(-30), [messages]);

  function toggle(next: boolean) {
    setVisible(next);
    onVisibilityChange?.(next);
  }

  async function loadFolder() {
    const nextRoot = root.trim();
    if (!nextRoot || busy) return;
    setBusy(true);
    setActiveRoot('');
    setPreview(null);
    try {
      const found = await invoke<Entry[]>('workspace_list_files', { root: nextRoot });
      setEntries(found);
      setActiveRoot(nextRoot);
      setSelected('');
      setContent('');
      setOriginal('');
      setMessage(nextRoot + ' · ' + found.length + ' öğe tarandı.');
    } catch (error) {
      setMessage('Klasör açılamadı: ' + String(error));
    } finally { setBusy(false); }
  }

  async function openFile(path: string) {
    if (!validRoot || busy) return;
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Vazgeçilsin mi?')) return;
    setBusy(true);
    setPreview(null);
    try {
      const text = await invoke<string>('workspace_read_file', { root: activeRoot, path });
      setSelected(path);
      setOriginal(text);
      setContent(text);
      setMessage('');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function saveFile() {
    if (!validRoot || !selected || !dirty || busy) return;
    if (!window.confirm(selected + '\n\nBu dosyaya yaptığın değişiklikler kaydedilsin mi?')) return;
    setBusy(true);
    try {
      await invoke('workspace_apply_edit', { root: activeRoot, path: selected, expectedContent: original, content });
      setOriginal(content);
      setMessage(selected + ' kaydedildi. Git ile geri alabilirsin.');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function runCommand() {
    if (!validRoot || !command.trim() || busy) return;
    if (!window.confirm('Bu terminal komutunu çalıştırmak istediğine emin misin?\n\n' + command)) return;
    setBusy(true);
    setTerminal('> ' + command + '\nÇalışıyor...');
    try {
      const output = await invoke<TerminalResult>('workspace_run_command', { root: activeRoot, command });
      setTerminal('> ' + command + '\n' + output.stdout + '\n' + output.stderr + '\nÇıkış kodu: ' + (output.exit_code ?? 'bilinmiyor'));
    } catch (error) { setTerminal('Komut hatası: ' + String(error)); }
    finally { setBusy(false); }
  }

  async function sendTask() {
    if (!validRoot || !task.trim() || sendDisabled || busy) return;
    const includeFile = Boolean(selected);
    const fileText = includeFile ? content : '';
    if (fileText.length > 12_000) {
      setMessage('Dosya içeriği 12.000 karakterden uzun. Daha küçük bir dosya seç veya görevi dosya eklemeden gönder.');
      return;
    }
    const warning = includeFile
      ? 'Seçili dosyanın içeriği ChatGPT / Claude / Gemini sohbetlerine gönderilecek. Şifre, token veya özel veri olmadığından emin misin?'
      : 'Görev metni seçili sohbet asistanlarına gönderilecek. Devam edilsin mi?';
    if (!window.confirm(warning)) return;
    const prompt = [
      'NetVera AI IDE — kod geliştirme görevi',
      'Proje: ' + activeRoot,
      'Kullanıcının görevi:\n' + task.trim(),
      includeFile ? 'İncelenecek dosya: ' + selected + '\n\n' + fileText : 'Dosya içeriği henüz paylaşılmadı; gerektiğinde kullanıcıdan iste.',
      AGENT_EDIT_GUIDANCE,
    ].join('\n\n---\n\n');
    setBusy(true);
    try {
      const sent = await onSendTask(prompt);
      if (!sent) throw new Error('Asistan oturumu hazır değil. Önce asistanlara giriş yap ve Coding modunu seç.');
      setTask('');
      setMessage('Görev seçili asistanlara gönderildi. Cevaplar geldikten sonra önerileri burada incele.');
      toggle(false);
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function previewProposal(proposal: AgentProposal) {
    if (!validRoot || busy) return;
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Önizlemeye geçilsin mi?')) return;
    setBusy(true);
    try {
      const op = proposal.operation;
      const existsInIndex = entries.some((entry) => entry.path === op.path && !entry.is_dir);
      if (op.action === 'EDIT_FILE' && !existsInIndex) throw new Error('Dosya listede yok. Klasörü yenile ve tekrar dene.');
      if (op.action === 'CREATE_FILE' && existsInIndex) throw new Error('Yeni dosya zaten var. Üzerine yazılamaz.');
      const before = existsInIndex
        ? await invoke<string>('workspace_read_file', { root: activeRoot, path: op.path })
        : null;
      const after = calculateProposedContent(op, before);
      if (after.length > 2_000_000) throw new Error('Önerilen dosya 2 MB sınırını aşıyor.');
      setPreview({ proposal, before, after });
      setMessage(op.path + ' için öneri hazır. Önce iki tarafı incele.');
    } catch (error) { setMessage('Önizleme hatası: ' + String(error)); }
    finally { setBusy(false); }
  }

  async function applyProposal() {
    if (!validRoot || !preview || busy) return;
    const { proposal, before, after } = preview;
    if (!window.confirm(
      proposal.provider + ' tarafından önerilen değişiklik diske yazılsın mı?\n\n' + proposal.operation.path +
      '\n\nİşlem Git üzerinden geri alınabilir; önce commit veya yedek alman önerilir.',
    )) return;
    setBusy(true);
    try {
      await invoke('workspace_apply_edit', {
        root: activeRoot, path: proposal.operation.path, expectedContent: before, content: after,
      });
      setSelected(proposal.operation.path);
      setOriginal(after);
      setContent(after);
      setPreview(null);
      setMessage('Değişiklik uygulandı: ' + proposal.operation.path);
      const found = await invoke<Entry[]>('workspace_list_files', { root: activeRoot });
      setEntries(found);
    } catch (error) { setMessage('Değişiklik uygulanamadı: ' + String(error)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" onClick={() => toggle(!visible)}
        className="fixed bottom-4 right-4 z-[100] rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-sky-600">
        {visible ? '✕ Kod alanını kapat' : '⌘ NetVera Kod Alanı'}
      </button>
      {visible && (
        <aside aria-label="NetVera kod çalışma alanı"
          className="fixed inset-3 z-[99] flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-2xl"
          style={{ paddingBottom: 65 }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <strong className="mr-2 text-base">NetVera AI IDE · Kod Çalışma Alanı</strong>
            <input className="min-w-48 flex-1 rounded bg-slate-800 px-2 py-2 text-sm" aria-label="Windows proje klasörü"
              placeholder="C:\Projeler\Tarak" value={root} onChange={(event) => setRoot(event.target.value)} />
            <button className="rounded bg-sky-700 px-3 py-2 text-sm disabled:opacity-50" disabled={busy}
              onClick={() => void loadFolder()}>Klasörü Aç / Yenile</button>
            <button className="rounded border border-slate-500 px-3 py-2 text-sm" onClick={() => toggle(false)}>Kapat</button>
          </div>
          {message && <p role="status" className="mb-2 max-h-16 overflow-auto text-xs text-amber-300">{message}</p>}
          <div className="flex min-h-0 flex-1 gap-3">
            <div className="w-60 shrink-0 overflow-auto rounded border border-slate-700 bg-slate-900 p-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide">Proje dosyaları ({files.length})</p>
              {files.map((entry) => (
                <button key={entry.path} className={'block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-slate-700 ' + (selected === entry.path ? 'bg-sky-800' : '')}
                  title={entry.path} disabled={!validRoot || busy} onClick={() => void openFile(entry.path)}>{entry.path}</button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-h-0 flex-1 gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{selected || 'Düzenlemek için bir dosya seç'} {dirty && '● Kaydedilmedi'}</span>
                    <button className="rounded bg-emerald-700 px-3 py-1.5 disabled:opacity-40" onClick={() => void saveFile()}
                      disabled={!dirty || !validRoot || busy}>Kaydet</button>
                  </div>
                  <textarea aria-label="Kod editörü" spellCheck={false} className="min-h-0 flex-1 resize-none rounded border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100"
                    value={content} onChange={(event) => setContent(event.target.value)} disabled={!selected || !validRoot || busy} />
                </div>
                <div className="flex w-80 shrink-0 flex-col gap-2 overflow-auto rounded border border-slate-700 bg-slate-900 p-2">
                  <p className="text-xs font-bold">Asistanlara kodlama görevi</p>
                  <textarea aria-label="Asistan görevi" className="min-h-24 w-full flex-1 resize-y rounded bg-slate-800 p-2 text-xs"
                    value={task} onChange={(event) => setTask(event.target.value)}
                    placeholder="Bu dosyadaki hatayı bul, düzeltme önerisini JSON olarak ver. Diğer asistanlar kontrol etsin." />
                  <p className="text-[11px] text-slate-400">Seçili dosya içeriği göreve eklenir. Normal sohbet oturumlarının Coding modunu ve ChatGPT/Claude/Gemini hedeflerini ana ekrandan seç.</p>
                  <button className="rounded bg-indigo-700 px-3 py-2 text-xs disabled:opacity-40" disabled={!validRoot || !task.trim() || sendDisabled || busy}
                    onClick={() => void sendTask()}>Seçili asistanlara görevi gönder</button>
                  <div className="border-t border-slate-700 pt-2">
                    <p className="mb-2 text-xs font-semibold">Asistanların dosya önerileri ({proposals.length})</p>
                    {proposals.length === 0 && <p className="text-[11px] text-slate-400">JSON kod değişikliği önerileri burada görünecek.</p>}
                    {proposals.map((proposal) => (
                      <button key={proposal.id} className="mb-1 block w-full truncate rounded bg-slate-800 p-2 text-left text-xs hover:bg-slate-700"
                        title={proposal.operation.path} disabled={!validRoot || busy} onClick={() => void previewProposal(proposal)}>
                        {proposal.provider}: {proposal.operation.action === 'CREATE_FILE' ? '+ ' : '✎ '}{proposal.operation.path}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {preview && (
                <div className="flex max-h-64 shrink-0 flex-col rounded border border-amber-600 bg-slate-900 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <strong className="truncate text-xs">Değişiklik önizlemesi · {preview.proposal.operation.path}</strong>
                    <div className="flex gap-2">
                      <button className="rounded border border-slate-500 px-3 py-1 text-xs" onClick={() => setPreview(null)}>Vazgeç</button>
                      <button className="rounded bg-emerald-700 px-3 py-1 text-xs disabled:opacity-50" disabled={busy}
                        onClick={() => void applyProposal()}>Onayla ve uygula</button>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 gap-2">
                    <div className="flex min-w-0 flex-1 flex-col"><span className="text-[10px] text-red-300">Önce</span>
                      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-black p-2 font-mono text-[10px]">{preview.before ?? '(yeni dosya)'}</pre></div>
                    <div className="flex min-w-0 flex-1 flex-col"><span className="text-[10px] text-green-300">Sonra</span>
                      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-black p-2 font-mono text-[10px]">{preview.after}</pre></div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <input aria-label="Terminal komutu" className="min-w-0 flex-1 rounded bg-slate-800 p-2 font-mono text-xs"
                  value={command} onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void runCommand(); }} />
                <button onClick={() => void runCommand()} disabled={busy || !validRoot}
                  className="rounded bg-sky-700 px-3 py-2 text-xs disabled:opacity-40">Terminal: Çalıştır</button>
              </div>
              <pre className="h-24 shrink-0 overflow-auto whitespace-pre-wrap rounded bg-black p-2 font-mono text-xs text-slate-200">{terminal}</pre>
              <p className="text-[10px] text-slate-400">Dosya düzenlemeleri önizleme ve açık onay gerektirir. Terminal yalnızca elle çalışır. Her komut için 60 saniye sınır vardır.</p>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
