const NAMED: Record<string, string> = {
  teal:   '#3eb4ac',
  orange: '#ffb347',
  pink:   '#ff5e7d',
  purple: '#a29bfe',
  mint:   '#00cec9',
  blue:   '#74b9ff',
};

/** Converts named color ('teal') or hex ('#3eb4ac') to hex string */
export function toHex(color: string): string {
  return color.startsWith('#') ? color : (NAMED[color] ?? '#3eb4ac');
}

/** Returns a light rgba background suitable for tags */
export function hexLight(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.15)`;
}
