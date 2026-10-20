import { useEffect, useRef, useState } from 'react';
import { pdfjs } from '../lib/pdf';

export function PdfView({ file, pageNumber, onSeekText }: { file: File; pageNumber?: number; onSeekText?: (text: string, page: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const seek = useRef(onSeekText);
  seek.current = onSeekText;
  const [pages, setPages] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
    const current = container.current;
    if (!current) return;
    current.replaceChildren();
    setPages(0); setError('');
    (async () => {
      try {
        const bytes = await file.arrayBuffer();
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const rendered = new Set<number>();
        const render = async (number: number, wrapper: HTMLDivElement) => {
          if (rendered.has(number) || cancelled) return;
          rendered.add(number);
          try {
            const page = await pdf.getPage(number);
            if (cancelled) return;
            const viewport = page.getViewport({ scale: Math.min(1.5, (current.clientWidth - 32) / page.getViewport({ scale: 1 }).width) });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width * devicePixelRatio); canvas.height = Math.ceil(viewport.height * devicePixelRatio);
            canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
            const context = canvas.getContext('2d');
            if (!context) return;
            wrapper.replaceChildren(canvas);
            await page.render({ canvasContext: context, canvas, viewport, transform: [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0] }).promise;
            if (cancelled) return;
            const layer = document.createElement('div'); layer.className = 'pdf-text-layer'; layer.style.width = `${viewport.width}px`; layer.style.height = `${viewport.height}px`;
            const content = await page.getTextContent();
            for (const item of content.items) {
              if (!('str' in item)) continue;
              const span = document.createElement('span'); span.textContent = item.str;
              const transform = pdfjs.Util.transform(viewport.transform, item.transform);
              const height = Math.hypot(transform[2], transform[3]);
              span.style.left = `${transform[4]}px`; span.style.top = `${transform[5] - height}px`;
              span.style.fontSize = `${height}px`; span.style.width = `${item.width * viewport.scale}px`;
              span.onclick = () => seek.current?.(item.str, number);
              layer.append(span);
            }
            wrapper.append(layer); page.cleanup();
          } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
        };
        observer = new IntersectionObserver(events => {
          for (const event of events) if (event.isIntersecting) {
            const wrapper = event.target as HTMLDivElement;
            void render(Number(wrapper.dataset.page), wrapper);
            observer?.unobserve(wrapper);
          }
        }, { root: current, rootMargin: '700px' });
        for (let number = 1; number <= pdf.numPages && !cancelled; number++) {
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: Math.min(1.5, (current.clientWidth - 32) / page.getViewport({ scale: 1 }).width) });
          const wrapper = document.createElement('div'); wrapper.className = 'pdf-page'; wrapper.dataset.page = String(number);
          wrapper.style.width = `${viewport.width}px`; wrapper.style.height = `${viewport.height}px`;
          current.append(wrapper); observer.observe(wrapper); page.cleanup();
        }
        if (!cancelled) setPages(pdf.numPages);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { cancelled = true; observer?.disconnect(); void loadingTask?.destroy(); current.replaceChildren(); };
  }, [file]);

  useEffect(() => {
    if (pageNumber && pages) container.current?.querySelector(`[data-page="${pageNumber}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [pageNumber, pages]);

  return <div className="pdf-view" ref={container} aria-label="PDF renderizado com camada de texto">{error && <p className="error">{error}</p>}</div>;
}
