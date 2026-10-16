// Small inline SVG icon set (stroke = currentColor)
const S = (inner, vb = 24) => `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const cloudPath = 'M7.5 18h9.2a3.8 3.8 0 0 0 .4-7.58A5.2 5.2 0 0 0 7.1 9.6 4.2 4.2 0 0 0 7.5 18z';
const sunRays = (cx, cy, r1, r2) =>
  [0, 45, 90, 135, 180, 225, 270, 315]
    .map((d) => {
      const a = (d * Math.PI) / 180;
      return `<line x1="${(cx + Math.cos(a) * r1).toFixed(2)}" y1="${(cy + Math.sin(a) * r1).toFixed(2)}" x2="${(cx + Math.cos(a) * r2).toFixed(2)}" y2="${(cy + Math.sin(a) * r2).toFixed(2)}"/>`;
    })
    .join('');

export const WX = {
  clear: S(`<circle cx="12" cy="12" r="4.2"/>${sunRays(12, 12, 6.6, 8.8)}`),
  clearNight: S(`<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>`),
  partly: S(`<circle cx="9" cy="8.5" r="3"/>${sunRays(9, 8.5, 4.6, 6.1)}<path d="M9.2 19h7.6a3.2 3.2 0 0 0 .3-6.38 4.4 4.4 0 0 0-8.3-.7A3.6 3.6 0 0 0 9.2 19z" fill="var(--icon-fill, #fff)"/>`),
  partlyNight: S(`<path d="M13 9.6A4.6 4.6 0 0 1 7.2 3.9a4.6 4.6 0 1 0 5.8 5.7z"/><path d="M9.2 20h7.6a3.2 3.2 0 0 0 .3-6.38 4.4 4.4 0 0 0-8.3-.7A3.6 3.6 0 0 0 9.2 20z" fill="var(--icon-fill, #fff)"/>`),
  cloudy: S(`<path d="${cloudPath}"/>`),
  fog: S(`<path d="M7.5 13.5h9.2a3.6 3.6 0 0 0 .4-7.1A5 5 0 0 0 7.2 5.6 3.9 3.9 0 0 0 7.5 13.5z"/><line x1="4" y1="17" x2="20" y2="17"/><line x1="6" y1="20.2" x2="18" y2="20.2"/>`),
  drizzle: S(`<path d="M7.5 15h9.2a3.6 3.6 0 0 0 .4-7.1A5 5 0 0 0 7.2 7.1 3.9 3.9 0 0 0 7.5 15z"/><line x1="9" y1="18" x2="8.5" y2="19.5"/><line x1="14" y1="18" x2="13.5" y2="19.5"/>`),
  rain: S(`<path d="M7.5 14h9.2a3.6 3.6 0 0 0 .4-7.1A5 5 0 0 0 7.2 6.1 3.9 3.9 0 0 0 7.5 14z"/><line x1="8.5" y1="17" x2="7.5" y2="20"/><line x1="12.5" y1="17" x2="11.5" y2="20"/><line x1="16.5" y1="17" x2="15.5" y2="20"/>`),
  heavyrain: S(`<path d="M7.5 13h9.2a3.6 3.6 0 0 0 .4-7.1A5 5 0 0 0 7.2 5.1 3.9 3.9 0 0 0 7.5 13z"/><line x1="7.5" y1="15.5" x2="6" y2="20.5"/><line x1="11.5" y1="15.5" x2="10" y2="20.5"/><line x1="15.5" y1="15.5" x2="14" y2="20.5"/><line x1="19" y1="15.5" x2="17.8" y2="19.5"/>`),
  snow: S(`<path d="M7.5 14h9.2a3.6 3.6 0 0 0 .4-7.1A5 5 0 0 0 7.2 6.1 3.9 3.9 0 0 0 7.5 14z"/><circle cx="8.5" cy="18" r=".6" fill="currentColor"/><circle cx="12" cy="20" r=".6" fill="currentColor"/><circle cx="15.5" cy="18" r=".6" fill="currentColor"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/>`),
  storm: S(`<path d="M7.5 13.5h9.2a3.6 3.6 0 0 0 .4-7.1A5 5 0 0 0 7.2 5.6 3.9 3.9 0 0 0 7.5 13.5z"/><path d="M12.6 14.5l-2.2 3.6h3l-2 3.4"/>`),
};

export function wxIcon(type, night = false) {
  if (night && type === 'clear') return WX.clearNight;
  if (night && type === 'partly') return WX.partlyNight;
  return WX[type] || WX.cloudy;
}

export const UI = {
  search: S(`<circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="20.5" y2="20.5"/>`),
  pin: S(`<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>`),
  locate: S(`<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/>`),
  sliders: S(`<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.2" fill="var(--icon-fill,#fff)"/><circle cx="15" cy="17" r="2.2" fill="var(--icon-fill,#fff)"/>`),
  eye: S(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>`),
  eyeOff: S(`<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.3 6.9C3.8 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 10a2.8 2.8 0 0 0 4 4"/>`),
  close: S(`<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`),
  plus: S(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`),
  edit: S(`<path d="M4 20h4L19 9l-4-4L4 16v4z"/><line x1="13.5" y1="6.5" x2="17.5" y2="10.5"/>`),
  check: S(`<polyline points="5 12.5 10 17 19 7.5"/>`),
  wind: S(`<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 15h15a3 3 0 1 1-3 3"/>`),
  drop: S(`<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>`),
  humidity: S(`<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/><line x1="9.5" y1="16.5" x2="14.5" y2="11.5"/><circle cx="10" cy="12" r=".5" fill="currentColor"/><circle cx="14" cy="16" r=".5" fill="currentColor"/>`),
  sound: S(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>`),
  mute: S(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><line x1="16" y1="9.5" x2="21" y2="14.5"/><line x1="21" y1="9.5" x2="16" y2="14.5"/>`),
  play: S(`<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>`),
  pause: S(`<rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/>`),
  reset: S(`<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><polyline points="4.5 4.5 4.5 8.5 8.5 8.5"/>`),
  trash: S(`<path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="M7 7l1 12h8l1-12"/>`),
  grip: S(`<circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="17" r="1" fill="currentColor"/><circle cx="15" cy="17" r="1" fill="currentColor"/>`),
};
