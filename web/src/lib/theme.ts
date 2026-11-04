export interface TenantBrand {
  name?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  theme?: 'light' | 'dark' | 'duo' | null;
  font_display?: 'default' | 'big-shoulders' | null;
  logo_url?: string | null;
  logo_dark_url?: string | null;
  symbol_url?: string | null;
}

/** Luminância relativa (WCAG) → decide texto preto ou branco sobre a cor da marca. */
function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const onBrand = (hex: string) => (luminance(hex) > 0.35 ? '#000000' : '#ffffff');
/** Marca como texto em fundo claro: escurece até ter contraste (verde Feeling sobre branco é 1,9:1). */
const brandText = (hex: string) => (luminance(hex) > 0.25 ? `color-mix(in oklab, ${hex} 55%, black)` : hex);

/** Logo adequado ao tema atual (contraste define a escolha, como no manual). */
export function logoFor(t: TenantBrand) {
  const dark = (t.theme ?? 'light') !== 'light'; // duo usa logo de fundo escuro: ele só aparece nas regiões pretas
  return (dark ? t.logo_dark_url || t.logo_url : t.logo_url || t.logo_dark_url) ?? null;
}

let manifestUrl: string | null = null;

export function applyTheme(t: TenantBrand) {
  const root = document.documentElement;
  const theme = t.theme ?? 'light';
  root.dataset.theme = theme;
  root.dataset.display = t.font_display ?? 'default';
  if (t.primary_color) {
    root.style.setProperty('--brand', t.primary_color);
    root.style.setProperty('--brand-fg', onBrand(t.primary_color));
    root.style.setProperty('--brand-text', theme === 'dark' ? t.primary_color : brandText(t.primary_color));
  }
  if (t.name) document.title = t.name;

  const bg = theme === 'light' ? '#ffffff' : '#000000';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);

  if (t.symbol_url) {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
    icon.type = 'image/png'; icon.href = t.symbol_url;
    document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.setAttribute('href', t.symbol_url);
  }

  // Manifest por tenant (PWA instalada com nome, cor e ícone da marca) sem perder o white-label.
  const abs = (u: string) => new URL(u, window.location.origin).href;
  const icons = t.symbol_url
    ? [{ src: abs(t.symbol_url), sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: abs(t.symbol_url), sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    : [{ src: abs('/icon-192.png'), sizes: '192x192', type: 'image/png' }, { src: abs('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }];
  const manifest = {
    name: t.name ?? 'Reconhecimento', short_name: (t.name ?? 'Reconhecer').slice(0, 12), lang: 'pt-BR',
    start_url: abs('/'), scope: abs('/'), display: 'standalone', background_color: bg, theme_color: bg, icons,
  };
  if (manifestUrl) URL.revokeObjectURL(manifestUrl);
  manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
  link.href = manifestUrl;
}
