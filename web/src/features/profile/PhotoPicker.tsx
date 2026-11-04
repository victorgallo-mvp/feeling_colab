import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Avatar, Button } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { squareCrop } from '../../lib/image';

/**
 * Escolher → prévia já recortada → confirmar. Funciona pra mim (/me/avatar) ou, como admin, pra outra pessoa.
 */
export function PhotoPicker({ name, currentUrl, endpoint, onChanged, size = 112 }: { name: string; currentUrl: string | null; endpoint: string; onChanged?: (url: string | null) => void; size?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const done = (url: string | null) => { qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['home'] }); qc.invalidateQueries({ queryKey: ['admin-users'] }); onChanged?.(url); };

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast('Imagem muito grande (máx. 20 MB)', 'err');
    try { const blob = await squareCrop(f); setPreview({ blob, url: URL.createObjectURL(blob) }); }
    catch (err: any) { toast(err?.message ?? 'Não consegui abrir a imagem', 'err'); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', preview.blob, 'foto.jpg');
      const r = await api<{ avatar_url: string }>(endpoint, { method: 'POST', body: fd });
      URL.revokeObjectURL(preview.url); setPreview(null); done(r.avatar_url); toast('Foto atualizada 📸');
    } catch (e: any) { toast(e?.message ?? 'Erro ao enviar', 'err'); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api(endpoint, { method: 'DELETE' }); done(null); toast('Foto removida'); }
    catch (e: any) { toast(e?.message ?? 'Erro ao remover', 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={preview?.url ?? currentUrl} size={size} className="ring-2 ring-line" />
      <div className="flex flex-col gap-2">
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
        {preview ? (
          <>
            <Button size="sm" onClick={save} loading={busy}>Usar esta foto</Button>
            <Button size="sm" variant="ghost" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>Escolher outra</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant={currentUrl ? 'soft' : 'primary'} onClick={() => input.current?.click()} disabled={busy}>{currentUrl ? 'Trocar foto' : 'Adicionar foto'}</Button>
            {currentUrl && <Button size="sm" variant="ghost" onClick={remove} loading={busy}>Remover</Button>}
          </>
        )}
        <span className="text-xs text-fg-faint">Recorte quadrado automático. JPG, PNG, WebP ou HEIC.</span>
      </div>
    </div>
  );
}
