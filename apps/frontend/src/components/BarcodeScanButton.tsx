import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { Modal } from './Modal';

/**
 * Botón "Escanear con cámara" — la mitad del par lector-físico/cámara para
 * buscar un artículo por código (ver skill de la auditoría de UX/inventario).
 * Un lector USB/Bluetooth no necesita esto: ya escribe en cualquier input de
 * texto como si fuera un teclado y termina con Enter. Esto cubre el caso sin
 * lector físico — celular o tablet con cámara.
 */
export function BarcodeScanButton({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    // Import diferido: @zxing/browser pesa ~300kb — cargarlo en el bundle
    // principal penaliza a todo el que nunca escanea. Solo se descarga
    // cuando de verdad se abre la cámara.
    import('@zxing/browser')
      .then(({ BrowserMultiFormatReader }) => {
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        return reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (cancelled) return;
          if (result) {
            onScan(result.getText());
            setOpen(false);
          }
          // El callback se dispara en cada frame sin lectura — es el flujo
          // normal mientras se enfoca el código, no un error que mostrar.
        });
      })
      .then((controls) => {
        if (!controls) return;
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.');
        }
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onScan]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        📷 Escanear con cámara
      </button>
      {open && (
        <Modal title="Escanear código" onClose={() => setOpen(false)}>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <video ref={videoRef} className="w-full rounded-md bg-black" muted playsInline />
              <p className="mt-2 text-xs text-slate-500">Apunta la cámara al código de barras o QR del artículo.</p>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
