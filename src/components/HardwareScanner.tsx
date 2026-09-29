import { ValuationSummary } from './Valuation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Upload, ScanLine } from 'lucide-react';
import { systemCategories } from '../../shared/types';
import {
  hardwareScanSchema,
  type HardwareScan,
  type HardwareSuggestion,
} from '../../shared/hardware-scan';
import { api, useResource } from '../api';
import { prepareScanPhoto } from '../lib/scan-photo';
import { ErrorState } from './ui';

export function HardwareScanner({
  isSystem,
  onUse,
  onAddComponent,
}: {
  isSystem: boolean;
  onUse: (item: HardwareSuggestion) => void;
  onAddComponent: (item: HardwareSuggestion) => void;
}) {
  const config = useResource<{ enabled: boolean }>('/hardware/scan');
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [photo, setPhoto] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<HardwareScan>();
  const [used, setUsed] = useState<number[]>([]);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  function clear() {
    generation.current++;
    controller.current?.abort();
    setPhoto('');
    setResult(undefined);
    setUsed([]);
    setError('');
    setScanning(false);
    setPreparing(false);
  }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clear();
    const current = generation.current;
    setPreparing(true);
    try {
      const image = await prepareScanPhoto(file);
      if (generation.current === current) setPhoto(image);
    } catch (e) {
      if (generation.current === current) setError((e as Error).message);
    } finally {
      if (generation.current === current) setPreparing(false);
    }
  }
  async function scan() {
    const current = generation.current;
    controller.current = new AbortController();
    setScanning(true);
    setError('');
    setResult(undefined);
    setUsed([]);
    try {
      const result = hardwareScanSchema.parse(
        await api<HardwareScan>('/hardware/scan', {
          method: 'POST',
          body: JSON.stringify({ image: photo }),
          signal: controller.current.signal,
        }),
      );
      if (current === generation.current) setResult(result);
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setScanning(false);
    }
  }
  return (
    <section className="hardware-scanner" aria-label="Scan hardware from a photo">
      <h3>
        <ScanLine size={19} /> Scan hardware from a photo
      </h3>
      <p className="muted small-text">
        Photograph the hardware and its label in good light. Review the suggested details before
        saving.
      </p>
      {config.loading ? (
        <p role="status">Checking photo scanning…</p>
      ) : config.error ? (
        <ErrorState message={config.error} retry={config.reload} />
      ) : !config.data?.enabled ? (
        <p className="muted small-text">
          Photo scanning needs setup: add OPENAI_API_KEY to the server environment, then restart the
          app.
        </p>
      ) : (
        <>
          <input
            ref={camera}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            aria-label="Take hardware photo"
            hidden
            onChange={choose}
          />
          <input
            ref={upload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Upload hardware photo"
            hidden
            onChange={choose}
          />
          <div className="scan-actions">
            <button
              type="button"
              className="button secondary"
              disabled={preparing || scanning}
              onClick={() => camera.current?.click()}
            >
              <Camera size={16} /> Take photo
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={preparing || scanning}
              onClick={() => upload.current?.click()}
            >
              <Upload size={16} /> Upload photo
            </button>
          </div>
          {preparing && <p role="status">Preparing photo…</p>}
          {photo && (
            <>
              <img className="scan-preview" src={photo} alt="Hardware photo to scan" />
              <p className="muted small-text">
                Scanning sends this photo to OpenAI for analysis. Stacked Deck does not save the
                photo.
              </p>
              <div className="scan-actions">
                <button type="button" className="button primary" disabled={scanning} onClick={scan}>
                  <ScanLine size={16} /> {scanning ? 'Scanning…' : 'Scan photo'}
                </button>
                <button type="button" className="button ghost" onClick={clear}>
                  {scanning ? 'Cancel scan' : 'Remove photo'}
                </button>
              </div>
            </>
          )}
          {scanning && <p role="status">Looking for hardware and readable labels…</p>}
          {result && (
            <div className="scan-results" aria-label="Scan suggestions">
              <p className="small-text">
                {result.message ||
                  (result.items.length
                    ? 'Choose a suggestion, then check its details in the form.'
                    : 'No hardware identified. Try a closer, clearer photo of the hardware or label.')}
              </p>
              {result.items.map((item, index) => {
                const computer = systemCategories.some((category) => category === item.category);
                const addPart = isSystem && !computer;
                const allowed = isSystem || !computer;
                return (
                  <article className="scan-suggestion" key={index}>
                    <h4>{item.name}</h4>
                    <p className="small-text">
                      {item.category} · {item.quantity} unit(s) · AI confidence: {item.confidence}
                    </p>
                    <p className="muted small-text">{item.evidence}</p>
                    {(item.manufacturer || item.model || item.serialNumber) && (
                      <p className="small-text">
                        {[
                          item.manufacturer,
                          item.model,
                          item.serialNumber && `Serial: ${item.serialNumber}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {item.notes && <p className="muted small-text">{item.notes}</p>}
                    {item.valuation ? (
                      <ValuationSummary value={item.valuation} />
                    ) : (
                      <p className="muted small-text">
                        No reliable value yet. Confirm the model and specifications to request an
                        estimate.
                      </p>
                    )}
                    {allowed ? (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={used.includes(index)}
                        onClick={() => {
                          if (addPart) onAddComponent(item);
                          else onUse(item);
                          setUsed((rows) => [...rows, index]);
                        }}
                      >
                        {used.includes(index)
                          ? 'Added to form'
                          : addPart
                            ? 'Add installed component'
                            : 'Use these details'}
                      </button>
                    ) : (
                      <p className="muted small-text">
                        Use Add computer to catalog this complete system.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
