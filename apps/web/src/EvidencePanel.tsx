import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, errorMessage, type Evidence, type EvidenceKind } from './api';
import { Badge, Button, Input, Loading, Notice } from './ui';

const MAX_BYTES = 10 * 1024 * 1024;
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function EvidencePanel({ projectId, kind, targetId, canAdd, canWithdraw }: {
  projectId: string; kind: EvidenceKind; targetId: string; canAdd: boolean; canWithdraw: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Evidence[]>();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => api.evidence(projectId, kind, targetId).then(setItems).catch((f) => setError(errorMessage(f)));
  useEffect(() => { if (open) void load(); }, [open, targetId]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (file && file.size > MAX_BYTES) { setError('El archivo supera el límite de 10 MB.'); return; }
    setBusy(true); setError(undefined);
    try {
      await api.addEvidence(projectId, kind, targetId, text, file);
      // Only now is it safe to clear the form: a failed upload keeps what the user chose, to retry.
      setText(''); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await load();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(item: Evidence) {
    const reason = reasons[item.id]?.trim() ?? '';
    if (!reason) { setError('Escribe el motivo para retirar la evidencia.'); return; }
    setBusy(true); setError(undefined);
    try {
      await api.withdrawEvidence(item.id, reason);
      await load();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Ver evidencias</Button>;

  return (
    <div className="space-y-3 rounded-control bg-subtle p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Evidencias</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Ocultar</Button>
      </div>
      {error && <Notice tone="red">{error}</Notice>}
      {!items && !error && <Loading />}
      {items?.length === 0 && <p className="text-sm text-muted">Aún no hay evidencias.</p>}
      <ul className="space-y-2">
        {items?.map((item) => (
          <li key={item.id} className="rounded-control border border-line bg-surface p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {item.addendum && <Badge tone="blue">Adenda</Badge>}
              {item.withdrawn && <Badge>Retirada</Badge>}
              <span className="text-xs text-muted">{item.uploadedBy.displayName} · {new Date(item.uploadedAt).toLocaleString('es-MX')}</span>
            </div>
            {item.withdrawn ? (
              <p className="mt-2 text-muted">
                Retirada por {item.withdrawn.by.displayName} el {new Date(item.withdrawn.at).toLocaleDateString('es-MX')}: {item.withdrawn.reason}
              </p>
            ) : (
              <>
                {item.text && <p className="mt-2 whitespace-pre-wrap text-ink">{item.text}</p>}
                {item.file && (
                  <p className="mt-2">
                    <a className="font-medium text-brand-strong underline" href={api.evidenceFileUrl(item.id)} target="_blank" rel="noreferrer">{item.file.name}</a>
                    <span className="text-muted"> · {size(item.file.sizeBytes)}</span>
                  </p>
                )}
                {item.file?.mime.startsWith('image/') && (
                  <img src={api.evidenceFileUrl(item.id)} alt={`Evidencia: ${item.file.name}`} className="mt-2 max-h-48 rounded-control border border-line" />
                )}
                {canWithdraw && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Input aria-label="Motivo del retiro" placeholder="Motivo para retirarla" className="min-h-8 flex-1"
                      value={reasons[item.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [item.id]: e.target.value })} />
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => withdraw(item)}>Retirar</Button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {canAdd && (
        <form onSubmit={add} className="space-y-2 border-t border-line pt-3">
          <Input aria-label="Texto de la evidencia" placeholder="Descripción o texto de la evidencia" maxLength={4000}
            value={text} onChange={(e) => setText(e.target.value)} />
          <input ref={fileInput} type="file" aria-label="Archivo de evidencia" className="block w-full text-sm text-ink-soft"
            accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.pptx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="text-xs text-muted">Imágenes, PDF, Word, Excel o PowerPoint, hasta 10 MB.</p>
          <Button type="submit" size="sm" variant="primary" disabled={busy}>{busy ? 'Subiendo…' : 'Agregar evidencia'}</Button>
        </form>
      )}
    </div>
  );
}
