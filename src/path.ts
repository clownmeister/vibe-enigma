// The letter's journey through the machine, drawn as a two-leg wire.

export interface PathOptions {
  /** Rotor names left to right. */
  order: string[];
  /** Letters at each stage; empty for the idle skeleton. */
  letters: string[];
  width: number;
  /** Skip the travelling pulse (play mode has no time for it). */
  still: boolean;
}

export function renderPath({ order, letters, width, still }: PathOptions): string {
  const n = order.length;
  const rightToLeft = [...order].reverse();
  const labels = ['in', 'plug', ...rightToLeft, 'ukw', ...order, 'out'];
  const W = Math.max(300, width),
    H = 64,
    k = labels.length,
    step = W / k,
    bw = Math.min(30, step - 6);
  const y = (i: number): number => (i <= n + 2 ? 20 : 44); // forward leg on top, return leg below
  const points = labels.map((_, i) => `${String(step * i + step / 2)},${String(y(i))}`);
  const live = letters.length > 0;
  const boxes = labels
    .map((label, i) => {
      const x = step * i + step / 2;
      const hot = live && (i === 0 || i === k - 1) ? 'hot' : '';
      return `<rect class="${hot}" x="${String(x - bw / 2)}" y="${String(y(i) - 11)}" width="${String(bw)}" height="22" rx="2"/>
      <text class="${hot}" x="${String(x)}" y="${String(y(i) + 4)}">${letters[i] ?? '·'}</text>
      <text class="lbl" x="${String(x)}" y="${String(y(i) + (i <= n + 2 ? -15 : 24))}">${label}</text>`;
    })
    .join('');
  const pulse =
    still || !live
      ? ''
      : `<circle class="pulse" r="3.5" opacity="0">
      <animateMotion begin="0.15s" dur="1.1s" fill="freeze" path="M${points.join(' L')}"/>
      <animate attributeName="opacity" begin="0.15s" dur="1.1s" fill="freeze" keyTimes="0;0.15;0.85;1" values="0;1;1;0"/></circle>`;
  return `<svg class="${live ? '' : 'idle'}" viewBox="0 -8 ${String(W)} ${String(H + 16)}" preserveAspectRatio="xMidYMid meet" aria-label="signal path">
    <polyline points="${points.join(' ')}"/>${pulse}${boxes}</svg>`;
}
