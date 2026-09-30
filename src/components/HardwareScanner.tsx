import { ConnectivitySummary, MatchResults } from './Connectivity';
import type { CompatibilityMatch } from '../../shared/connectivity';
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [mode, setMode] = useState('hardware');
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
    setPhotos([]);
    setResult(undefined);
    setUsed([]);
    setError('');
    setScanning(false);
    setPreparing(false);
  }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (photos.length + files.length > 3) {
      setError('Use up to three photos of the same object.');
      return;
    }
    generation.current++;
    controller.current?.abort();
    setResult(undefined);
    setUsed([]);
    setError('');
    setScanning(false);
    const current = generation.current;
    setPreparing(true);
    try {
      const images = await Promise.all(files.map(prepareScanPhoto));
      if (generation.current === current) setPhotos((previous) => [...previous, ...images]);
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
          body: JSON.stringify({
            ...(photos.length === 1 ? { image: photos[0] } : { images: photos }),
            mode,
          }),
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
        Photograph both cable ends, the electrical label and the connector. Add up to three views of
        the same object, then review the suggested details before saving.
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
          <label className="scan-mode">
            Identify
            <select
              aria-label="Scan mode"
              value={mode}
              disabled={scanning}
              onChange={(e) => {
                setMode(e.target.value);
                setResult(undefined);
              }}
            >
              <option value="hardware">Hardware</option>
              <option value="cable">Mystery cable — what is this?</option>
              <option value="charger">Mystery power adapter</option>
              <option value="port">Device port</option>
            </select>
          </label>
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
            multiple
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
          {photos.length > 0 && (
            <>
              <div className="scan-photo-list">
                {photos.map((photo, index) => (
                  <img
                    key={index}
                    className="scan-preview"
                    src={photo}
                    alt={
                      index === 0 ? 'Hardware photo to scan' : `Hardware photo ${index + 1} to scan`
                    }
                  />
                ))}
              </div>
              <p className="muted small-text">
                Scanning sends these photos to OpenAI for analysis. Stack Tech does not save the
                photos. Add another photo above to show the label or other end.
              </p>
              <div className="scan-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={scanning || preparing}
                  onClick={scan}
                >
                  <ScanLine size={16} />{' '}
                  {scanning
                    ? 'Scanning…'
                    : photos.length > 1
                      ? 'Scan photos together'
                      : 'Scan photo'}
                </button>
                <button type="button" className="button ghost" onClick={clear}>
                  {scanning ? 'Cancel scan' : photos.length > 1 ? 'Remove photos' : 'Remove photo'}
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
                    {item.candidates?.length ? (
                      <p>Possible connectors: {item.candidates.join(' · ')}</p>
                    ) : null}
                    {item.likelyUses?.length ? (
                      <p>Common uses: {item.likelyUses.join(' · ')}</p>
                    ) : null}
                    {item.connectivity && (
                      <>
                        <ConnectivitySummary value={item.connectivity} />
                        <ScanInventory item={item} />
                      </>
                    )}
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

function ScanInventory({ item }: { item: HardwareSuggestion }) {
  const [duplicates, setDuplicates] = useState<
    { itemId: string; name: string; quantity: number; location: string | null }[]
  >([]);
  const [matches, setMatches] = useState<CompatibilityMatch[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: typeof duplicates }>('/hardware/duplicates', {
      method: 'POST',
      body: JSON.stringify(item),
      signal: controller.signal,
    })
      .then((r) => setDuplicates(r.items))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [item]);
  return (
    <div className="scan-inventory">
      {duplicates.length > 0 && (
        <div className="duplicate-notice">
          <strong>
            You may already own {duplicates.reduce((n, i) => n + i.quantity, 0)} of these.
          </strong>
          {duplicates.map((d) => (
            <p key={d.itemId}>
              {d.name} · ×{d.quantity} · {d.location || 'No location'}
            </p>
          ))}
          <p className="small-text">
            Compare these cards before adding another. You can edit an existing card’s quantity.
          </p>
        </div>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const result = await api<{ matches: CompatibilityMatch[] }>('/hardware/matches', {
              method: 'POST',
              body: JSON.stringify({ connectivity: item.connectivity }),
            });
            setMatches(result.matches);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Checking inventory…' : 'Find compatible equipment I own'}
      </button>
      {error && <p role="alert">{error}</p>}
      {matches && <MatchResults matches={matches} />}
    </div>
  );
}
