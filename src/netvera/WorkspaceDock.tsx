import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Entry = { path: string; is_dir: boolean };
type TerminalResult = { exit_code: number | null; stdout: string; stderr: string };

export function WorkspaceDock() {
  const [visible, setVisible] = useState(false);
  const [root, setRoot] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState('');
  const [original, setOriginal] = useState('');
  const [content, setContent] = useState('');
  const [command, setCommand] = useState('git status');
  const [terminal, setTerminal] = useState('Terminal hazır. Komutları yalnızca sen çalıştırabilirsin.');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = selected !== '' && content !== original;
  const files = useMemo(() => entries.filter((entry) => !entry.is_dir), [entries]);

  async function loadFolder() {
    if (!root.trim()) return;
    setBusy(true);
    try {
      const found = await invoke<Entry[]>('workspace_list_files', { root });
      setEntries(found);
      setSelected(''); setContent(''); setOriginal('');
      setMessage(`${found.length} öğe tarandı.`);
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function openFile(path: string) {
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Vazgeçilsin mi?')) return;
    setBusy(true);
    try {
      const text = await invoke<string>('workspace_read_file', { root, path });
      setSelected(path); setOriginal(text); setContent(text); setMessage('');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function saveFile() {
    if (!selected || !dirty) return;
    if (!window.confirm(`${selected} dosyasının üzerine yazılsın mı?`)) return;
    setBusy(true);
    try {
      await invoke('workspace_write_file', { root, path: selected, content });
      setOriginal(content); setMessage(`${selected} kaydedildi. Git ile geri alabilirsin.`);
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function runCommand() {
    if (!root || !command.trim()) return;
    if (!window.confirm(`Bu komut proje klasöründe çalıştırılsın mı?\n\n${command}`)) return;
    setBusy(true); setTerminal(`> ${command}\nÇalışıyor...`);
    try {
      const output = await invoke<TerminalResult>('workspace_run_command', { root, command });
      setTerminal(`> ${command}\n${output.stdout}\n${output.stderr}\nÇıkış kodu: ${output.exit_code ?? 'bilinmiyor'}`);
    } catch (error) { setTerminal(String(error)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setVisible((open) => !open)}
        className="fixed bottom-4 right-4 z-[100] rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-sky-600">
        {visible ? '✕ Çalışma alanını kapat' : '⌘ NetVera Kod Alanı'}
      </button>
      {visible && (
        <aside aria-label="NetVera kod çalışma alanı"
          className="fixed inset-4 z-[99] flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-2xl"
          style={{ paddingBottom: 70 }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <strong className="mr-2 text-base">NetVera AI IDE · Kod Çalışma Alanı</strong>
            <input className="min-w-48 flex-1 rounded bg-slate-800 px-2 py-2 text-sm" aria-label="Windows proje klasörü"
              placeholder="C:\\Projeler\\Tarak" value={root} onChange={(event) => setRoot(event.target.value)} />
            <button className="rounded bg-sky-700 px-3 py-2 text-sm" disabled={busy} onClick={() => void loadFolder()}>Klasörü Aç</button>
            <button className="rounded border border-slate-500 px-3 py-2 text-sm" onClick={() => setVisible(false)}>Kapat</button>
          </div>
          {message && <p role="status" className="mb-2 text-xs text-amber-300">{message}</p>}
          <div className="flex min-h-0 flex-1 gap-3">
            <div className="w-64 shrink-0 overflow-auto rounded border border-slate-700 bg-slate-900 p-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide">Dosyalar ({files.length})</p>
              {files.map((entry) => (
                <button key={entry.path} className={`block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-slate-700 ${selected === entry.path ? 'bg-sky-800' : ''}`}
                  title={entry.path} onClick={() => void openFile(entry.path)}>{entry.path}</button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{selected || 'Bir dosya seç'} {dirty && '● Değiştirildi'}</span>
                <button className="rounded bg-emerald-700 px-3 py-1.5 disabled:opacity-40" onClick={() => void saveFile()} disabled={!dirty || busy}>Kaydet</button>
              </div>
              <textarea aria-label="Kod editörü" spellCheck={false} className="min-h-0 flex-1 resize-none rounded border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100"
                value={content} onChange={(event) => setContent(event.target.value)} disabled={!selected || busy} />
              <div className="flex gap-2">
                <input aria-label="Terminal komutu" className="min-w-0 flex-1 rounded bg-slate-800 p-2 font-mono text-xs"
                  value={command} onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void runCommand(); }} />
                <button onClick={() => void runCommand()} disabled={busy || !root} className="rounded bg-sky-700 px-3 py-2 text-xs disabled:opacity-40">Çalıştır</button>
              </div>
              <pre className="h-32 overflow-auto whitespace-pre-wrap rounded bg-black p-2 font-mono text-xs text-slate-200">{terminal}</pre>
              <p className="text-[10px] text-slate-400">Komutlar ve dosya kaydı yalnızca senin onayınla çalışır. Otomatik ajan uygulaması henüz etkin değil.</p>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
