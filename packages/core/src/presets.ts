import { foldText } from './categories';
import type { Channel } from './model';

export type ChannelPreset = 'all' | 'france';

export const FRENCH_BOUQUETS = [
  { id: 'tnt', label: 'TNT' },
  { id: 'canal', label: 'Canal+' },
  { id: 'ligue1', label: 'Ligue 1+' },
  { id: 'bein', label: 'beIN Sports' },
  { id: 'dazn', label: 'DAZN' },
  { id: 'rmc-sport', label: 'RMC Sport' },
  { id: 'rmc', label: 'RMC' },
] as const;

export type FrenchBouquet = (typeof FRENCH_BOUQUETS)[number]['id'];

/** Providers use compatibility characters for tags: ᴿᴬᵂ / ᴮᴱ / ᴴᴰ. */
const presetText = (text: string) => foldText(text.normalize('NFKD'));
const isRaw = (channel: Channel) => {
  const name = presetText(channel.name);
  if (/\braw\b/.test(name)) return true;
  // Mixed provider groups contain HD streams too: the channel's quality takes precedence.
  if (/\b(?:sd|hd|fhd|uhd|4k|8k|hevc|h264|h265)\b/.test(name)) return false;
  return /\braw\b/.test(presetText(channel.group ?? ''));
};
const displayNumber = (channel: Channel) => Number(channel.number);

/** Ignore provider/quality labels but preserve station names, Live numbers and Access. */
function rmcStation(channel: Channel): string {
  const name = presetText(channel.name).replace(/[^a-z0-9]+/g, ' ');
  return name
    .slice(name.search(/\brmc/))
    .replace(/\brmc\s*sports?\b/, 'rmc sport')
    .replace(/\b(live|sport)\s*(\d+)\b/g, '$1 $2')
    .replace(/\b\d+\s*fps\b/g, ' ')
    .replace(/\b(?:raw|vip|gold|sd|hd|fhd|uhd|4k|8k|h264|backup|50|60)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function curateRmc(channels: readonly Channel[]): Channel[] {
  const stations = new Map<string, Channel>();
  for (const channel of channels) {
    const key = rmcStation(channel);
    const previous = stations.get(key);
    if (!previous || (!isRaw(previous) && isRaw(channel))) stations.set(key, channel);
  }
  return [...stations.values()];
}

/** Match the station before stripping quality tags, keeping TF1 Séries Films distinct from TF1. */
function tntStation(channel: Channel): string {
  const name = presetText(channel.name).replace(/[^a-z0-9]+/g, ' ');
  const stations = [
    /\btf\s*1\s*series\s*films\b/,
    /\bfrance\s*info\b/,
    /\bfrance\s*([2345])\b/,
    /\btf\s*1\b/,
    /\bm\s*6\b/,
    /\bbfm\s*tv\b/,
    /\bc\s*star\b/,
    /\b6\s*ter\b/,
    /\bpublic\s*senat\b/,
    /\bcherie\s*25\b/,
    /\bnovo\s*19\b/,
    /\bl\s*equipe\b/,
    /\bcmi\s*tv\b/,
    /\b(?:arte|w9|tmc|tfx|gulli|cnews|lci|lcp|novelas|t18)\b/,
  ];
  const match = stations.map((pattern) => name.match(pattern)?.[0]).find(Boolean);
  return (match ?? name).replace(/\s+/g, '');
}

/** First provider-specific curation, based on the numbers shown in Zapp. */
function curateTnt(channels: readonly Channel[]): Channel[] {
  const eligible = channels.filter((channel) => {
    const number = displayNumber(channel);
    if (number === 17871 || (number >= 18001 && number <= 18025)) return false;
    const name = presetText(channel.name);
    return !(
      /\bprime\b/.test(`${name} ${presetText(channel.group ?? '')}`) &&
      /\bfrance\s*(?:[2345]|info)\b/.test(name)
    );
  });
  const stations = new Map<string, Channel[]>();
  for (const channel of eligible) {
    const key = tntStation(channel);
    const variants = stations.get(key) ?? [];
    variants.push(channel);
    stations.set(key, variants);
  }
  return [...stations.values()].map(
    (variants) =>
      variants.find(
        (channel) => tntStation(channel) === 'tf1' && displayNumber(channel) === 17990,
      ) ??
      variants.find(isRaw) ??
      variants[0]!,
  );
}

/** Provider spelling and quality tags vary; match families on word boundaries. */
export function frenchBouquet(channel: Channel): FrenchBouquet | undefined {
  const text = presetText(channel.name)
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const group = presetText(channel.group ?? '').replace(/[^a-z0-9]+/g, ' ');
  if (/\btring\s+novelas\b/.test(text)) return undefined;
  // Apply before bouquet selection so TNT can fall back to a playable non-HEVC variant.
  const excludedCodec = /\b(?:hevc|h\s*265)\b/;
  if (excludedCodec.test(text) || excludedCodec.test(group)) return undefined;
  if (/\bdazn\b/.test(text)) {
    // Keep only the selected French RAW feeds from the reference catalogue.
    const french = group.trim()
      ? /^fr\b/.test(group.trim())
      : /\bfr dazn\b/.test(text) && !/\bbe fr dazn\b/.test(text);
    if (!french || !/\bdazn\s+(?:ppv\s+)?\d+\b/.test(text)) return undefined;
    const number = displayNumber(channel);
    if (number >= 19472 && number <= 19483 && isRaw(channel)) return 'dazn';
    return undefined;
  }
  // These brands also exist abroad. Explicit country markers take precedence over the name.
  const foreign =
    /\b(?:uk|us|usa|au|aus|australia|ar|arabic|arab|es|espana|spain|de|germany|it|italia|italy|pt|portugal|tr|turkey|pl|poland|be(?!\s+in\b)|belgium|ch|swiss|ca|canada|africa)\b/;
  if (foreign.test(text) || foreign.test(group)) return undefined;
  if (/\bligue\s*1\s*(?:plus|pass)\b/.test(text)) return 'ligue1';
  if (/\bbe\s*in\s*sports?(?:\s*\d+)?\b/.test(text)) return 'bein';
  if (/\brmc\s*sports?\b/.test(text)) return 'rmc-sport';
  if (/\brmc\b/.test(text)) return 'rmc';
  if (
    /\bcanal\s*(?:plus|sport\w*|cinema|series|decale|grand|box|foot|live|premier|kids|docs|action)\b/.test(
      text,
    )
  )
    return 'canal';
  if (
    /\b(?:tf1|tf\s*1|france\s*[2345]|m6|m\s*6|arte|w9|tmc|tfx|gulli|bfm\s*tv|bfmtv|cnews|lci|france\s*info|franceinfo|lcp|public\s*senat|cstar|c\s*star|6ter|6\s*ter|cherie\s*25|novelas|novo\s*19|t18|l\s*equipe|cmi\s*tv)\b/.test(
      text,
    )
  )
    return 'tnt';
  return undefined;
}

/** Empty bouquets are omitted. Channel identities, stream URLs and EPG keys stay intact. */
export function buildFrenchBouquets(channels: readonly Channel[]) {
  const members = new Map<FrenchBouquet, Channel[]>(FRENCH_BOUQUETS.map((b) => [b.id, []]));
  for (const channel of channels) {
    const bouquet = frenchBouquet(channel);
    if (bouquet) members.get(bouquet)!.push(channel);
  }
  members.set('tnt', curateTnt(members.get('tnt')!));
  members.set(
    'rmc-sport',
    curateRmc(
      members
        .get('rmc-sport')!
        .filter((channel) => displayNumber(channel) >= 18336 && displayNumber(channel) <= 18393),
    ),
  );
  members.set(
    'rmc',
    curateRmc(members.get('rmc')!.filter((channel) => displayNumber(channel) !== 19822)),
  );
  members.set(
    'bein',
    members
      .get('bein')!
      .filter(
        (channel) =>
          displayNumber(channel) >= 18245 &&
          displayNumber(channel) <= 18254 &&
          /\bvip\b/.test(presetText(`${channel.name} ${channel.group ?? ''}`)),
      ),
  );
  members.set(
    'ligue1',
    members
      .get('ligue1')!
      .filter(
        (channel) =>
          isRaw(channel) && displayNumber(channel) >= 18307 && displayNumber(channel) <= 18316,
      ),
  );
  return FRENCH_BOUQUETS.map((b) => ({
    ...b,
    title: b.label,
    channels: members.get(b.id)!.map((channel) => channel.id),
  })).filter((b) => b.channels.length > 0);
}
