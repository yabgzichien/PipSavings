// src/components/BrandLogo.tsx
import React from 'react';
import { Image, ImageSourcePropType } from 'react-native';

export type BankKey =
  | 'maybank'
  | 'tng'
  | 'hong_leong'
  | 'hsbc'
  | 'public_bank'
  | 'cimb'
  | 'rhb'
  | 'gxbank'
  | 'ryt_bank'
  | 'wise';

export type CryptoKey =
  | 'btc'
  | 'eth'
  | 'ada'
  | 'sol'
  | 'sui'
  | 'xrp'
  | 'hype'
  | 'usdt'
  | 'usdc';

export type SubscriptionKey =
  | 'netflix'
  | 'spotify'
  | 'youtube'
  | 'apple'
  | 'openai'
  | 'google_ai'
  | 'claude'
  | 'cursor'
  | 'redone'
  | 'anytime_fitness'
  | 'disney_hotstar'
  | 'duolingo'
  | 'maxis'
  | 'celcomdigi'
  | 'unifi'
  | 'umobile'
  | 'yes'
  | 'tnb'
  | 'air_selangor'
  | 'astro'
  | 'indah_water'
  | 'prime_video'
  | 'hbo'
  | 'canva'
  | 'adobe'
  | 'github'
  | 'microsoft'
  | 'notion'
  | 'playstation'
  | 'fitness_first'
  | 'aia'
  | 'great_eastern'
  | 'prudential'
  | 'allianz';

export type CarKey =
  | 'proton'
  | 'perodua'
  | 'honda'
  | 'toyota'
  | 'byd'
  | 'chery'
  | 'audi'
  | 'mazda'
  | 'nissan'
  | 'porsche'
  | 'bmw'
  | 'mercedes';

export type BrandKey = BankKey | CryptoKey | SubscriptionKey | CarKey;

/** Authentic brand assets loaded from assets/logos/ */
const BRAND_IMAGES: Record<BrandKey, ImageSourcePropType> = {
  // Banks
  maybank: require('../../assets/logos/banks/maybank.png'),
  tng: require('../../assets/logos/banks/tng.png'),
  hong_leong: require('../../assets/logos/banks/hong_leong.png'),
  hsbc: require('../../assets/logos/banks/hsbc.png'),
  public_bank: require('../../assets/logos/banks/public_bank.png'),
  cimb: require('../../assets/logos/banks/cimb.png'),
  rhb: require('../../assets/logos/banks/rhb.png'),
  gxbank: require('../../assets/logos/banks/gxbank.png'),
  ryt_bank: require('../../assets/logos/banks/ryt_bank.png'),
  wise: require('../../assets/logos/banks/wise.png'),

  // Crypto
  btc: require('../../assets/logos/crypto/btc.png'),
  eth: require('../../assets/logos/crypto/eth.png'),
  ada: require('../../assets/logos/crypto/ada.png'),
  sol: require('../../assets/logos/crypto/sol.png'),
  sui: require('../../assets/logos/crypto/sui.png'),
  xrp: require('../../assets/logos/crypto/xrp.png'),
  hype: require('../../assets/logos/crypto/hype.png'),
  usdt: require('../../assets/logos/crypto/usdt.png'),
  usdc: require('../../assets/logos/crypto/usdc.png'),

  // Digital Subscriptions, Telcos, Utilities, Gyms & AI
  netflix: require('../../assets/logos/merchants/netflix.png'),
  spotify: require('../../assets/logos/merchants/spotify.png'),
  youtube: require('../../assets/logos/merchants/youtube.png'),
  apple: require('../../assets/logos/merchants/apple.png'),
  openai: require('../../assets/logos/merchants/openai.png'),
  google_ai: require('../../assets/logos/merchants/google_ai.png'),
  claude: require('../../assets/logos/merchants/claude.png'),
  cursor: require('../../assets/logos/merchants/cursor.png'),
  redone: require('../../assets/logos/merchants/redone.png'),
  anytime_fitness: require('../../assets/logos/merchants/anytime_fitness.png'),
  disney_hotstar: require('../../assets/logos/merchants/disney_hotstar.png'),
  duolingo: require('../../assets/logos/merchants/duolingo.png'),
  maxis: require('../../assets/logos/merchants/maxis.png'),
  celcomdigi: require('../../assets/logos/merchants/celcomdigi.png'),
  unifi: require('../../assets/logos/merchants/unifi.png'),
  umobile: require('../../assets/logos/merchants/umobile.png'),
  yes: require('../../assets/logos/merchants/yes.png'),
  tnb: require('../../assets/logos/merchants/tnb.png'),
  air_selangor: require('../../assets/logos/merchants/air_selangor.png'),
  astro: require('../../assets/logos/merchants/astro.png'),
  indah_water: require('../../assets/logos/merchants/indah_water.png'),
  prime_video: require('../../assets/logos/merchants/prime_video.png'),
  hbo: require('../../assets/logos/merchants/hbo.png'),
  canva: require('../../assets/logos/merchants/canva.png'),
  adobe: require('../../assets/logos/merchants/adobe.png'),
  github: require('../../assets/logos/merchants/github.png'),
  microsoft: require('../../assets/logos/merchants/microsoft.png'),
  notion: require('../../assets/logos/merchants/notion.png'),
  playstation: require('../../assets/logos/merchants/playstation.png'),
  fitness_first: require('../../assets/logos/merchants/fitness_first.png'),
  aia: require('../../assets/logos/merchants/aia.png'),
  great_eastern: require('../../assets/logos/merchants/great_eastern.png'),
  prudential: require('../../assets/logos/merchants/prudential.png'),
  allianz: require('../../assets/logos/merchants/allianz.png'),

  // Car Brands
  proton: require('../../assets/logos/cars/proton.png'),
  perodua: require('../../assets/logos/cars/perodua.png'),
  honda: require('../../assets/logos/cars/honda.png'),
  toyota: require('../../assets/logos/cars/toyota.png'),
  byd: require('../../assets/logos/cars/byd.png'),
  chery: require('../../assets/logos/cars/chery.png'),
  audi: require('../../assets/logos/cars/audi.png'),
  mazda: require('../../assets/logos/cars/mazda.png'),
  nissan: require('../../assets/logos/cars/nissan.png'),
  porsche: require('../../assets/logos/cars/porsche.png'),
  bmw: require('../../assets/logos/cars/bmw.png'),
  mercedes: require('../../assets/logos/cars/mercedes.png'),
};

/** Renders authentic brand logos using official high-res assets */
export function BrandLogo({
  brand,
  size = 24,
}: {
  brand: BrandKey;
  size?: number;
}) {
  const source = BRAND_IMAGES[brand];
  if (!source) return null;
  return (
    <Image
      source={source}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Match string/ticker against supported cryptocurrencies */
export function matchCrypto(symbolOrTicker: string | null | undefined): CryptoKey | null {
  if (!symbolOrTicker) return null;
  const raw = norm(symbolOrTicker).replace(/[-_/](usd|myr|usdt|usdc)$/i, '');
  if (raw === 'btc' || raw === 'xbt' || raw === 'bitcoin') return 'btc';
  if (raw === 'eth' || raw === 'ethereum') return 'eth';
  if (raw === 'ada' || raw === 'cardano') return 'ada';
  if (raw === 'sol' || raw === 'solana') return 'sol';
  if (raw === 'sui') return 'sui';
  if (raw === 'xrp' || raw === 'ripple') return 'xrp';
  if (raw === 'hype' || raw === 'hyperliquid') return 'hype';
  if (raw === 'usdt' || raw === 'tether') return 'usdt';
  if (raw === 'usdc' || raw === 'usd coin') return 'usdc';
  return null;
}

/** Searchable catalogue used by the commitment-name autocomplete. */
export const BRAND_SUGGESTIONS: { key: BrandKey; label: string }[] = [
  // Streaming & Entertainment
  { key: 'netflix', label: 'Netflix' },
  { key: 'spotify', label: 'Spotify' },
  { key: 'youtube', label: 'YouTube Premium' },
  { key: 'disney_hotstar', label: 'Disney+ Hotstar' },
  { key: 'prime_video', label: 'Prime Video' },
  { key: 'hbo', label: 'HBO Max' },
  { key: 'astro', label: 'Astro' },
  // Apple & Google
  { key: 'apple', label: 'Apple One' },
  { key: 'apple', label: 'iCloud+' },
  { key: 'google_ai', label: 'Google One' },
  { key: 'google_ai', label: 'Gemini Advanced' },
  // AI & Productivity
  { key: 'openai', label: 'ChatGPT Plus' },
  { key: 'openai', label: 'ChatGPT Pro' },
  { key: 'claude', label: 'Claude Pro' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'notion', label: 'Notion' },
  { key: 'canva', label: 'Canva Pro' },
  { key: 'adobe', label: 'Adobe Creative Cloud' },
  { key: 'github', label: 'GitHub Copilot' },
  { key: 'microsoft', label: 'Microsoft 365' },
  { key: 'playstation', label: 'PlayStation Plus' },
  // Fitness
  { key: 'anytime_fitness', label: 'Anytime Fitness' },
  { key: 'fitness_first', label: 'Fitness First' },
  // Education
  { key: 'duolingo', label: 'Duolingo' },
  // Malaysian Telcos
  { key: 'maxis', label: 'Maxis' },
  { key: 'maxis', label: 'Hotlink' },
  { key: 'celcomdigi', label: 'CelcomDigi' },
  { key: 'unifi', label: 'Unifi' },
  { key: 'umobile', label: 'U Mobile' },
  { key: 'yes', label: 'YES 5G' },
  { key: 'redone', label: 'redONE' },
  // Malaysian Utilities
  { key: 'tnb', label: 'TNB' },
  { key: 'air_selangor', label: 'Air Selangor' },
  { key: 'indah_water', label: 'Indah Water' },
  // Insurance
  { key: 'aia', label: 'AIA' },
  { key: 'great_eastern', label: 'Great Eastern' },
  { key: 'prudential', label: 'Prudential' },
  { key: 'allianz', label: 'Allianz' },
];

/**
 * Intelligent deterministic matcher for Banks, Digital Subscriptions,
 * Utilities, Telcos, Gyms, Insurers, Cryptocurrencies, and Car Brands.
 */
export function matchBrand(text: string | null | undefined): BrandKey | null {
  if (!text) return null;
  const q = norm(text);
  if (!q) return null;

  // 1. Malaysian Banks & E-wallets (High Priority)
  if (q.includes('ryt bank') || q.includes('ryt') || q.includes('ytl digital bank') || q.includes('ytl bank')) return 'ryt_bank';
  if (/(?:^|\W)wise(?:$|\W)/.test(q)) return 'wise';
  if (q.includes('gxbank') || q.includes('gx bank')) return 'gxbank';
  if (q.includes('maybank') || q.includes('mbb') || q.includes('maybank2u') || q.includes('mae')) return 'maybank';
  if (q.includes('touch n go') || q.includes("touch 'n go") || /(?:^|\W)tng(?:$|\W)/.test(q)) return 'tng';
  if (q.includes('hong leong') || q.includes('hlb')) return 'hong_leong';
  if (q.includes('hsbc')) return 'hsbc';
  if (q.includes('public bank') || q.includes('pbb') || q.includes('pbe')) return 'public_bank';
  if (q.includes('cimb')) return 'cimb';
  if (q.includes('rhb')) return 'rhb';

  // 2. Cryptocurrencies
  const cryptoMatch = matchCrypto(q);
  if (cryptoMatch) return cryptoMatch;

  // 3. Digital Subscriptions, Streaming, AI & Productivity
  if (q.includes('apple') || q.includes('icloud') || q.includes('itunes')) return 'apple';
  if (q.includes('redone') || q.includes('red one')) return 'redone';
  if (q.includes('openai') || q.includes('chatgpt') || q.includes('chat gpt') || q.includes('gpt-4')) return 'openai';
  if (q.includes('youtube') || q.includes('yt premium')) return 'youtube';
  if (q.includes('claude') || q.includes('anthropic')) return 'claude';
  if (q.includes('anytime fitness') || q.includes('any time fitness') || q.includes('af fitness') || q.includes('anytime gym')) return 'anytime_fitness';
  if (q.includes('disney') || q.includes('hotstar')) return 'disney_hotstar';
  if (q.includes('duolingo')) return 'duolingo';
  if (q.includes('netflix')) return 'netflix';
  if (q.includes('spotify')) return 'spotify';
  if (q.includes('google ai') || q.includes('gemini advanced') || q.includes('gemini ai') || q.includes('google one ai') || q.includes('google one')) return 'google_ai';
  if (q.includes('cursor') || q.includes('anysphere')) return 'cursor';
  if (q.includes('prime video') || q.includes('amazon prime')) return 'prime_video';
  if (/(?:^|\W)hbo(?:$|\W)/.test(q) || q.includes('hbo max') || q.includes('hbo go')) return 'hbo';
  if (q.includes('canva')) return 'canva';
  if (q.includes('adobe') || q.includes('photoshop') || q.includes('lightroom') || q.includes('creative cloud')) return 'adobe';
  if (q.includes('github') || q.includes('copilot')) return 'github';
  if (q.includes('microsoft') || q.includes('office 365') || q.includes('ms 365') || q.includes('onedrive')) return 'microsoft';
  if (q.includes('notion')) return 'notion';
  if (q.includes('playstation') || q.includes('ps plus') || q.includes('psn')) return 'playstation';
  if (q.includes('fitness first')) return 'fitness_first';

  // 4. Malaysian Telcos & Utilities
  if (q.includes('maxis') || q.includes('hotlink')) return 'maxis';
  if (q.includes('celcomdigi') || q.includes('celcom') || /(?:^|\W)digi(?:$|\W)/.test(q)) return 'celcomdigi';
  if (q.includes('unifi') || q.includes('tm unifi') || q.includes('telekom')) return 'unifi';
  if (q.includes('u mobile') || q.includes('umobile') || q.includes('u-mobile')) return 'umobile';
  if (q.includes('yes 5g') || q.includes('yes altitude') || q.includes('ytl yes')) return 'yes';
  if (/(?:^|\W)tnb(?:$|\W)/.test(q) || q.includes('tenaga')) return 'tnb';
  if (q.includes('air selangor') || q.includes('syabas')) return 'air_selangor';
  if (q.includes('astro')) return 'astro';
  if (q.includes('indah water') || /(?:^|\W)iwk(?:$|\W)/.test(q)) return 'indah_water';

  // 5. Insurance & Takaful
  if (/(?:^|\W)aia(?:$|\W)/.test(q) || q.includes('aia takaful') || q.includes('aia insurance')) return 'aia';
  if (q.includes('great eastern') || q.includes('greateastern')) return 'great_eastern';
  if (q.includes('prudential') || q.includes('prubsn')) return 'prudential';
  if (q.includes('allianz')) return 'allianz';

  // 6. Car Brands (Loans & Commitments)
  if (q.includes('proton') || q.includes('x50') || q.includes('x70') || q.includes('x90') || q.includes('s70') || q.includes('saga') || q.includes('persona') || q.includes('iriz')) return 'proton';
  if (q.includes('perodua') || q.includes('myvi') || q.includes('bezza') || q.includes('alza') || q.includes('axia') || q.includes('ativa') || q.includes('aruz')) return 'perodua';
  if (q.includes('honda') || q.includes('civic') || q.includes('city') || q.includes('hr-v') || q.includes('hrv') || q.includes('cr-v') || q.includes('crv') || q.includes('accord')) return 'honda';
  if (q.includes('toyota') || q.includes('vios') || q.includes('yaris') || q.includes('corolla') || q.includes('camry') || q.includes('hilux') || q.includes('veloz') || q.includes('cross')) return 'toyota';
  if (q.includes('byd') || q.includes('atto') || q.includes('dolphin') || q.includes('sealion')) return 'byd';
  if (q.includes('chery') || q.includes('omoda') || q.includes('tiggo') || q.includes('jaecoo')) return 'chery';
  if (q.includes('audi')) return 'audi';
  if (q.includes('mazda') || q.includes('cx-3') || q.includes('cx-5') || q.includes('cx-30') || q.includes('cx-8')) return 'mazda';
  if (q.includes('nissan') || q.includes('almera') || q.includes('serena') || q.includes('navara')) return 'nissan';
  if (q.includes('porsche') || q.includes('macan') || q.includes('cayenne') || q.includes('taycan')) return 'porsche';
  if (q.includes('bmw')) return 'bmw';
  if (q.includes('mercedes') || q.includes('benz') || q.includes('amg')) return 'mercedes';

  return null;
}
