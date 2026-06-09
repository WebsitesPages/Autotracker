import { useRef, useState } from 'react';
import { Camera, FileText, FolderOpen, Trash2, X, ExternalLink, Paperclip } from 'lucide-react';
import { api, fileUrl } from '../api';
import { Card, CardTitle } from '../ui/Card';
import { Empty } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import type { Car } from '../types';

const isPdfEntry = (u: string) => u.includes('|pdf|') || u.slice(-4).toLowerCase() === '.pdf';
const pdfUrlOf = (u: string) => (u.includes('|pdf|') ? u.split('|pdf|')[1] : u);
const pdfNameOf = (u: string) =>
  u.includes('|pdf|') ? u.split('|pdf|')[0] : (u.split('/').pop() ?? 'Dokument').split('.')[0];

// Bilder vor dem Upload clientseitig verkleinern (max. 800px, JPEG 70 %)
async function compressToBase64(file: File, maxWidth = 800, quality = 0.7): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// PDF.js wird erst beim Öffnen geladen (haelt das Haupt-Bundle klein)
async function renderPdf(url: string, container: HTMLDivElement, token: { cancelled: boolean }) {
  const pdfjsLib = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

  const pdf = await pdfjsLib.getDocument(url).promise;
  if (token.cancelled) return;
  container.innerHTML = '';
  const dpr = window.devicePixelRatio || 1;
  const maxW = Math.min(container.clientWidth || window.innerWidth, 1000) - 8;

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    if (token.cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const scale = maxW / base.width;
    const viewport = page.getViewport({ scale: scale * dpr });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.className = 'mx-auto mb-3 rounded-lg shadow-lg bg-white max-w-full';
    canvas.style.width = viewport.width / dpr + 'px';
    canvas.style.height = viewport.height / dpr + 'px';
    container.appendChild(canvas);

    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    if (token.cancelled) return;
  }
}

export function FilesSection({ car, onChanged }: { car: Car; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [progress, setProgress] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pdfView, setPdfView] = useState<string | null>(null);
  const pdfContainer = useRef<HTMLDivElement | null>(null);
  const pdfToken = useRef<{ cancelled: boolean }>({ cancelled: false });

  const photos = car.photos.filter(u => !isPdfEntry(u));
  const pdfs = car.photos.filter(isPdfEntry);

  async function upload(files: FileList | null, type: 'photo' | 'pdf') {
    if (!files?.length) return;
    const MAX_PDF_BYTES = 36 * 1024 * 1024; // passt nach Base64 unter das 50-MB-Limit
    let uploaded = 0, failed = 0, tooLarge = 0;

    for (const file of Array.from(files)) {
      setProgress(`${file.name} wird hochgeladen …`);
      try {
        if (type === 'pdf') {
          if (file.size > MAX_PDF_BYTES) { tooLarge++; continue; }
          await api.uploadFile(car.id, { pdfData: await fileToBase64(file), fileName: file.name, type: 'pdf' });
        } else {
          const b64 = await compressToBase64(file);
          if (!b64) { failed++; continue; }
          await api.uploadFile(car.id, { imageData: b64, fileName: file.name, type: 'photo' });
        }
        uploaded++;
      } catch {
        failed++;
      }
    }
    setProgress(null);
    if (uploaded) toast(`${uploaded} Datei${uploaded > 1 ? 'en' : ''} hochgeladen`);
    if (tooLarge) toast(`${tooLarge} PDF(s) zu groß – max. ca. 36 MB`, 'warn');
    if (failed) toast(`${failed} Datei(en) fehlgeschlagen`, 'error');
    onChanged();
  }

  async function remove(url: string) {
    const ok = await confirm({ title: 'Datei löschen?', danger: true, confirmLabel: 'Löschen' });
    if (!ok) return;
    try {
      await api.deleteFile(car.id, url);
      toast('Datei gelöscht');
      onChanged();
    } catch {
      toast('Fehler beim Löschen', 'error');
    }
  }

  function openPdf(url: string) {
    pdfToken.current.cancelled = true;
    pdfToken.current = { cancelled: false };
    setPdfView(url);
    // Container wird nach dem Rendern des Overlays befuellt
    requestAnimationFrame(() => {
      const el = pdfContainer.current;
      if (!el) return;
      el.innerHTML = '<div class="text-center text-sm py-12" style="color:#868b97">Lädt …</div>';
      renderPdf(url, el, pdfToken.current).catch(() => {
        if (!pdfToken.current.cancelled && pdfContainer.current) {
          pdfContainer.current.innerHTML =
            `<div class="text-center text-sm py-12" style="color:#fb7185">PDF konnte nicht geladen werden. <a href="${url}" target="_blank" rel="noopener" style="text-decoration:underline">In neuem Tab öffnen</a></div>`;
        }
      });
    });
  }

  function closePdf() {
    pdfToken.current.cancelled = true;
    setPdfView(null);
  }

  return (
    <Card className="p-5">
      <CardTitle
        icon={<Paperclip size={15} />}
        action={
          <div className="flex gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs px-3 py-1.5 rounded-xl transition-colors">
              <Camera size={13} /> Foto
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => { upload(e.target.files, 'photo'); e.target.value = ''; }} />
            </label>
            <label className="cursor-pointer inline-flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs px-3 py-1.5 rounded-xl transition-colors">
              <FileText size={13} /> PDF
              <input type="file" accept="application/pdf" multiple className="hidden" onChange={e => { upload(e.target.files, 'pdf'); e.target.value = ''; }} />
            </label>
          </div>
        }
      >
        Fotos &amp; Dokumente
      </CardTitle>

      {progress && (
        <div className="mb-3 flex items-center gap-2.5 text-xs text-night-300">
          <div className="w-4 h-4 border-2 border-night-500 border-t-gold-400 rounded-full animate-spin" />
          {progress}
        </div>
      )}

      {photos.length === 0 && pdfs.length === 0 && !progress ? (
        <Empty icon={<FolderOpen />} text="Noch keine Dateien vorhanden" />
      ) : (
        <>
          {photos.length > 0 && (
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 ${pdfs.length > 0 ? 'mb-4' : ''}`}>
              {photos.map((url, i) => (
                <div key={url} className="relative group aspect-square">
                  <img
                    src={fileUrl(url)}
                    loading="lazy"
                    onClick={() => setLightbox(fileUrl(url))}
                    className="w-full h-full object-cover rounded-xl cursor-pointer border border-white/[0.06]"
                  />
                  <button
                    onClick={() => remove(url)}
                    className="absolute top-1.5 right-1.5 bg-night-950/70 hover:bg-rose-500 text-white w-7 h-7 rounded-full text-xs sm:opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  >
                    <X size={13} />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 bg-night-950/70 text-[10px] text-white px-2 py-0.5 rounded-full">
                      Titelbild
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {pdfs.length > 0 && (
            <div className="space-y-2">
              {pdfs.map(entry => (
                <div key={entry} className="flex items-center justify-between gap-3 bg-night-700/40 rounded-xl px-4 py-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 w-9 h-9 rounded-xl bg-gold-500/12 text-gold-300 flex items-center justify-center">
                      <FileText size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{pdfNameOf(entry)}</div>
                      <div className="text-[11px] text-night-400">PDF-Dokument</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openPdf(fileUrl(pdfUrlOf(entry)))}
                      className="bg-gold-500/12 hover:bg-gold-500/20 text-gold-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Öffnen
                    </button>
                    <button onClick={() => remove(entry)} className="text-night-500 hover:text-rose-400 transition-colors p-1">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 overlay-in" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-[95vw] max-h-[92dvh] object-contain rounded-xl" />
          <button className="absolute top-4 right-4 text-white p-2 pt-safe" onClick={() => setLightbox(null)}>
            <X size={26} />
          </button>
        </div>
      )}

      {/* PDF-Viewer (rendert alle Seiten – iframe zeigt auf iOS nur Seite 1) */}
      {pdfView && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-night-900">
          <div className="flex items-center justify-between px-4 py-3 bg-night-800 border-b border-white/[0.07] pt-safe">
            <span className="text-sm font-medium inline-flex items-center gap-2">
              <FileText size={15} className="text-gold-400" /> PDF-Dokument
            </span>
            <div className="flex items-center gap-3">
              <a href={pdfView} target="_blank" rel="noopener" className="text-gold-300 hover:text-gold-200 text-sm inline-flex items-center gap-1">
                <ExternalLink size={14} /> Neuer Tab
              </a>
              <button onClick={closePdf} className="text-night-300 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
          </div>
          <div ref={pdfContainer} className="flex-1 w-full overflow-y-auto p-3 sm:p-4 pb-safe" />
        </div>
      )}
    </Card>
  );
}
