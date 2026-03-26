import React, { useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import styles from './ColorPickerSheet.module.css';

/* ── Color math ── */
function hsvToHex(h: number, s: number, v: number): string {
  const l = (v / 100) * (1 - s / 200);
  const sl = s === 0 ? 0 : (v / 100 - l) / Math.min(l, 1 - l);
  return hslToHex(h, (sl || 0) * 100, l * 100);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d % 6) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  return [h, max ? (d / max) * 100 : 0, max * 100];
}

interface Props {
  value: string;
  onConfirm: (hex: string) => void;
  onClose: () => void;
}

const ColorPickerSheet: React.FC<Props> = ({ value, onConfirm, onClose }) => {
  const initial = value.startsWith('#') ? hexToHsv(value) : [200, 70, 75] as [number, number, number];
  const [hue, setHue] = useState(initial[0]);
  const [sat, setSat] = useState(initial[1]);
  const [val, setVal] = useState(initial[2]);

  const areaRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const currentHex = hsvToHex(hue, sat, val);

  const pickArea = useCallback((cx: number, cy: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(1, (cx - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (cy - r.top) / r.height));
    setSat(x * 100);
    setVal(100 - y * 100);
  }, []);

  const pickHue = useCallback((cx: number) => {
    const r = hueRef.current?.getBoundingClientRect();
    if (!r) return;
    setHue(Math.max(0, Math.min(360, ((cx - r.left) / r.width) * 360)));
  }, []);

  const content = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <div className={styles.title}>Выберите цвет</div>

        {/* 2D gradient area */}
        <div
          ref={areaRef}
          className={styles.area}
          style={{ background: `hsl(${hue},100%,50%)` }}
          onMouseDown={e => { e.preventDefault(); pickArea(e.clientX, e.clientY); }}
          onMouseMove={e => { if (e.buttons === 1) pickArea(e.clientX, e.clientY); }}
          onTouchStart={e => pickArea(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={e => { e.preventDefault(); pickArea(e.touches[0].clientX, e.touches[0].clientY); }}
        >
          <div className={styles.satLayer} />
          <div className={styles.valLayer} />
          <div
            className={styles.areaCursor}
            style={{ left: `${sat}%`, top: `${100 - val}%`, background: currentHex }}
          />
        </div>

        {/* Hue slider */}
        <div
          ref={hueRef}
          className={styles.hueTrack}
          onMouseDown={e => { e.preventDefault(); pickHue(e.clientX); }}
          onMouseMove={e => { if (e.buttons === 1) pickHue(e.clientX); }}
          onTouchStart={e => pickHue(e.touches[0].clientX)}
          onTouchMove={e => { e.preventDefault(); pickHue(e.touches[0].clientX); }}
        >
          <div
            className={styles.hueThumb}
            style={{ left: `${(hue / 360) * 100}%`, background: `hsl(${hue},100%,50%)` }}
          />
        </div>

        {/* Footer: preview + hex + confirm */}
        <div className={styles.footer}>
          <div className={styles.preview} style={{ background: currentHex }} />
          <span className={styles.hexText}>{currentHex}</span>
          <button
            className={styles.confirmBtn}
            onClick={() => { onConfirm(currentHex); onClose(); }}
          >
            Выбрать
          </button>
        </div>
      </div>
    </div>
  );

  const portal = document.getElementById('app-shell');
  return portal ? ReactDOM.createPortal(content, portal) : content;
};

export default ColorPickerSheet;
