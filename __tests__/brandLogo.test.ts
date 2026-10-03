// __tests__/brandLogo.test.ts
import { matchBrand, matchCrypto } from '../src/components/BrandLogo';

describe('BrandLogo Matching Engine', () => {
  describe('Cryptocurrency matching', () => {
    it('matches standard crypto symbols and names', () => {
      expect(matchCrypto('BTC')).toBe('btc');
      expect(matchCrypto('btc')).toBe('btc');
      expect(matchCrypto('Bitcoin')).toBe('btc');
      expect(matchCrypto('ETH')).toBe('eth');
      expect(matchCrypto('ethereum')).toBe('eth');
      expect(matchCrypto('ADA')).toBe('ada');
      expect(matchCrypto('cardano')).toBe('ada');
      expect(matchCrypto('SOL')).toBe('sol');
      expect(matchCrypto('solana')).toBe('sol');
      expect(matchCrypto('SUI')).toBe('sui');
      expect(matchCrypto('XRP')).toBe('xrp');
      expect(matchCrypto('ripple')).toBe('xrp');
      expect(matchCrypto('HYPE')).toBe('hype');
      expect(matchCrypto('hyperliquid')).toBe('hype');
      expect(matchCrypto('USDT')).toBe('usdt');
      expect(matchCrypto('tether')).toBe('usdt');
      expect(matchCrypto('USDC')).toBe('usdc');
      expect(matchCrypto('usd coin')).toBe('usdc');
    });

    it('strips common ticker currency suffixes', () => {
      expect(matchCrypto('BTC-USD')).toBe('btc');
      expect(matchCrypto('ETH-MYR')).toBe('eth');
      expect(matchCrypto('SOL_USDT')).toBe('sol');
      expect(matchCrypto('SUI-USDC')).toBe('sui');
    });

    it('returns null for unmapped tickers or invalid values', () => {
      expect(matchCrypto('AAPL')).toBeNull();
      expect(matchCrypto('')).toBeNull();
      expect(matchCrypto(null)).toBeNull();
      expect(matchCrypto(undefined)).toBeNull();
    });
  });

  describe('Bank matching via matchBrand', () => {
    it('matches traditional and digital Malaysian banks', () => {
      expect(matchBrand('Maybank')).toBe('maybank');
      expect(matchBrand('Maybank2u')).toBe('maybank');
      expect(matchBrand('MBB')).toBe('maybank');
      expect(matchBrand('MAE')).toBe('maybank');
      expect(matchBrand('Touch n Go')).toBe('tng');
      expect(matchBrand("Touch 'n Go eWallet")).toBe('tng');
      expect(matchBrand('TNG')).toBe('tng');
      expect(matchBrand('Hong Leong Bank')).toBe('hong_leong');
      expect(matchBrand('HLB')).toBe('hong_leong');
      expect(matchBrand('HSBC Bank')).toBe('hsbc');
      expect(matchBrand('Public Bank')).toBe('public_bank');
      expect(matchBrand('PBB')).toBe('public_bank');
      expect(matchBrand('CIMB Bank')).toBe('cimb');
      expect(matchBrand('RHB Bank')).toBe('rhb');
      expect(matchBrand('GXBank')).toBe('gxbank');
      expect(matchBrand('GX Bank')).toBe('gxbank');
      expect(matchBrand('Ryt Bank')).toBe('ryt_bank');
      expect(matchBrand('YTL Digital Bank')).toBe('ryt_bank');
      expect(matchBrand('Wise')).toBe('wise');
      expect(matchBrand('Wise SGD Account')).toBe('wise');
    });
  });

  describe('Digital subscription & AI matching', () => {
    it('matches popular streaming and software services', () => {
      expect(matchBrand('Netflix Monthly')).toBe('netflix');
      expect(matchBrand('Spotify Family')).toBe('spotify');
      expect(matchBrand('YouTube Premium')).toBe('youtube');
      expect(matchBrand('Apple One')).toBe('apple');
      expect(matchBrand('Apple Music')).toBe('apple');
      expect(matchBrand('iCloud+ 50GB')).toBe('apple');
      expect(matchBrand('OpenAI ChatGPT Plus')).toBe('openai');
      expect(matchBrand('ChatGPT Plus')).toBe('openai');
      expect(matchBrand('Google AI')).toBe('google_ai');
      expect(matchBrand('Gemini Advanced')).toBe('google_ai');
      expect(matchBrand('Claude Pro Anthropic')).toBe('claude');
      expect(matchBrand('Claude')).toBe('claude');
      expect(matchBrand('Cursor AI Subscription')).toBe('cursor');
      expect(matchBrand('RedOne')).toBe('redone');
      expect(matchBrand('redONE Postpaid')).toBe('redone');
      expect(matchBrand('AnyTime Fitness')).toBe('anytime_fitness');
      expect(matchBrand('Disney Hotstar')).toBe('disney_hotstar');
      expect(matchBrand('Disney+ Hotstar')).toBe('disney_hotstar');
      expect(matchBrand('Duolingo')).toBe('duolingo');
      expect(matchBrand('Duolingo Super')).toBe('duolingo');
      expect(matchBrand('Prime Video')).toBe('prime_video');
      expect(matchBrand('HBO Max')).toBe('hbo');
      expect(matchBrand('Canva Pro')).toBe('canva');
      expect(matchBrand('Adobe Creative Cloud')).toBe('adobe');
      expect(matchBrand('GitHub Copilot')).toBe('github');
      expect(matchBrand('Microsoft 365')).toBe('microsoft');
      expect(matchBrand('Notion Plus')).toBe('notion');
      expect(matchBrand('PlayStation Plus')).toBe('playstation');
      expect(matchBrand('Fitness First')).toBe('fitness_first');
    });

    it('matches Malaysian telcos and utilities', () => {
      expect(matchBrand('Maxis Postpaid')).toBe('maxis');
      expect(matchBrand('Hotlink')).toBe('maxis');
      expect(matchBrand('CelcomDigi 5G')).toBe('celcomdigi');
      expect(matchBrand('Digi Postpaid')).toBe('celcomdigi');
      expect(matchBrand('Unifi Home Broadband')).toBe('unifi');
      expect(matchBrand('TM Unifi')).toBe('unifi');
      expect(matchBrand('U Mobile GX30')).toBe('umobile');
      expect(matchBrand('Yes 5G Infinite')).toBe('yes');
      expect(matchBrand('TNB Electricity')).toBe('tnb');
      expect(matchBrand('Tenaga Nasional')).toBe('tnb');
      expect(matchBrand('Air Selangor')).toBe('air_selangor');
      expect(matchBrand('Astro')).toBe('astro');
      expect(matchBrand('Indah Water')).toBe('indah_water');
      expect(matchBrand('IWK Sewerage')).toBe('indah_water');
    });

    it('matches insurers and takaful', () => {
      expect(matchBrand('AIA Insurance')).toBe('aia');
      expect(matchBrand('AIA Takaful')).toBe('aia');
      expect(matchBrand('Great Eastern Life')).toBe('great_eastern');
      expect(matchBrand('Prudential Assurance')).toBe('prudential');
      expect(matchBrand('PruBSN Takaful')).toBe('prudential');
      expect(matchBrand('Allianz Life')).toBe('allianz');
    });
  });

  describe('Car brand matching for car loans / commitments', () => {
    it('matches Malaysian and international car brands and vehicle models', () => {
      expect(matchBrand('Proton X50 Loan')).toBe('proton');
      expect(matchBrand('Proton Saga HP')).toBe('proton');
      expect(matchBrand('Perodua Myvi Loan')).toBe('perodua');
      expect(matchBrand('Perodua Bezza')).toBe('perodua');
      expect(matchBrand('Perodua Alza Installment')).toBe('perodua');
      expect(matchBrand('Honda Civic')).toBe('honda');
      expect(matchBrand('Honda City HP')).toBe('honda');
      expect(matchBrand('Toyota Vios')).toBe('toyota');
      expect(matchBrand('Toyota Hilux Loan')).toBe('toyota');
      expect(matchBrand('BYD Atto 3')).toBe('byd');
      expect(matchBrand('BYD Dolphin')).toBe('byd');
      expect(matchBrand('Chery Omoda 5')).toBe('chery');
      expect(matchBrand('Audi A4')).toBe('audi');
      expect(matchBrand('Mazda CX-5')).toBe('mazda');
      expect(matchBrand('Nissan Almera')).toBe('nissan');
      expect(matchBrand('Porsche Macan')).toBe('porsche');
      expect(matchBrand('BMW 320i')).toBe('bmw');
      expect(matchBrand('Mercedes-Benz C200')).toBe('mercedes');
    });
  });

  describe('Graceful fallbacks', () => {
    it('returns null on unmapped merchant or text', () => {
      expect(matchBrand('Uncle Lim Kopi')).toBeNull();
      expect(matchBrand('Jaya Grocer')).toBeNull();
      expect(matchBrand('Pasar Malam')).toBeNull();
      expect(matchBrand('')).toBeNull();
      expect(matchBrand(null)).toBeNull();
      expect(matchBrand(undefined)).toBeNull();
    });
  });
});
