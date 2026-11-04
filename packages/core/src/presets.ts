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

/** Themed groups of the TV tab. "Mes chaînes" is the favourites list, not a group. */
export const CHANNEL_GROUPS = [
  { id: 'tnt', label: 'TNT' },
  { id: 'sport', label: 'Sport' },
  { id: 'cinema', label: 'Cinéma et séries' },
  { id: 'info', label: 'Info' },
  { id: 'docs', label: 'Découverte' },
] as const;

export type ChannelGroup = (typeof CHANNEL_GROUPS)[number]['id'];

interface Station {
  name: string;
  /** French logical channel number; stations without one are numbered after the others. */
  number?: number;
  groups: ChannelGroup[];
}

/** Keyed by tntStation(). */
const TNT_STATIONS: Record<string, Station> = {
  tf1: { name: 'TF1', number: 1, groups: [] },
  france2: { name: 'France 2', number: 2, groups: [] },
  france3: { name: 'France 3', number: 3, groups: [] },
  france4: { name: 'France 4', number: 14, groups: [] },
  france5: { name: 'France 5', number: 5, groups: ['docs'] },
  m6: { name: 'M6', number: 6, groups: [] },
  arte: { name: 'Arte', number: 7, groups: ['docs'] },
  lcp: { name: 'LCP', number: 8, groups: ['info'] },
  w9: { name: 'W9', number: 9, groups: [] },
  tmc: { name: 'TMC', number: 10, groups: ['cinema'] },
  tfx: { name: 'TFX', number: 11, groups: ['cinema'] },
  bfmtv: { name: 'BFMTV', number: 15, groups: ['info'] },
  cnews: { name: 'CNews', number: 16, groups: ['info'] },
  cstar: { name: 'CStar', number: 17, groups: [] },
  gulli: { name: 'Gulli', number: 18, groups: [] },
  novo19: { name: 'Novo19', number: 19, groups: [] },
  tf1seriesfilms: { name: 'TF1 Séries Films', number: 20, groups: ['cinema'] },
  lequipe: { name: 'L’Équipe', number: 21, groups: ['sport'] },
  '6ter': { name: '6ter', number: 22, groups: [] },
  cherie25: { name: 'Chérie 25', number: 25, groups: [] },
  lci: { name: 'LCI', number: 26, groups: ['info'] },
  franceinfo: { name: 'franceinfo', number: 27, groups: ['info'] },
  // LCP and Public Sénat share 8: Public Sénat goes after the TNT so numbers stay unique.
  publicsenat: { name: 'Public Sénat', groups: ['info'] },
  t18: { name: 'T18', groups: [] },
  novelas: { name: 'Novelas TV', groups: ['cinema'] },
  cmitv: { name: 'CMI TV', groups: [] },
};

/** First number of each bouquet: 20 numbers each, more than any curated bouquet holds. */
const BOUQUET_BASE: Record<Exclude<FrenchBouquet, 'tnt'>, number> = {
  canal: 40,
  ligue1: 101,
  bein: 121,
  dazn: 141,
  'rmc-sport': 161,
  rmc: 181,
};
/** TNT channels without an official number come after the official ones. */
const TNT_EXTRA_BASE = 30;

/** Provider prefixes and quality tags removed, for reading the station out of a name. */
function cleanName(channel: Channel): string {
  return presetText(channel.name)
    .replace(/^(?:[a-z]{2,4}\s*[:|]\s*)+/, '')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b\d+\s*fps\b/g, ' ')
    .replace(/\b(?:fr|be|vip|gold|raw|sd|hd|fhd|uhd|4k|8k|h264|backup|50|60)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Label 2" when the cleaned name ends with a channel index, else "Label". */
const indexed = (label: string, text: string) => {
  const n = text.match(/\b(\d{1,2})$/)?.[1];
  return n ? `${label} ${Number(n)}` : label;
};

const CANAL: [RegExp, string, ChannelGroup[]][] = [
  [/\bsport\s*360\b/, 'Canal+ Sport 360', ['sport']],
  [/\bsport\b/, 'Canal+ Sport', ['sport']],
  [/\bfoot\b/, 'Canal+ Foot', ['sport']],
  [/\blive\b/, 'Canal+ Live', ['sport']],
  [/\bpremier\b/, 'Canal+ Premier League', ['sport']],
  [/\bcinema\b/, 'Canal+ Cinéma', ['cinema']],
  [/\bseries\b/, 'Canal+ Séries', ['cinema']],
  [/\bgrand\b/, 'Canal+ Grand Écran', ['cinema']],
  [/\baction\b/, 'Canal+ Action', ['cinema']],
  [/\bbox\b/, 'Canal+ Box Office', ['cinema']],
  [/\bdecale\b/, 'Canal+ Décalé', ['cinema']],
  [/\bdocs\b/, 'Canal+ Docs', ['docs']],
  [/\bkids\b/, 'Canal+ Kids', []],
];

/** Display name, groups and, when it has one, the French number of a preset channel. */
function present(channel: Channel, bouquet: FrenchBouquet): Station {
  const text = cleanName(channel);
  switch (bouquet) {
    case 'tnt': {
      const station = TNT_STATIONS[tntStation(channel)];
      return station
        ? { ...station, groups: ['tnt', ...station.groups] }
        : { name: channel.name, groups: ['tnt'] };
    }
    case 'canal': {
      const hit = CANAL.find(([pattern]) => pattern.test(text));
      if (!hit) return { name: 'Canal+', number: 4, groups: ['sport', 'cinema'] };
      return { name: indexed(hit[1], text), groups: hit[2] };
    }
    case 'ligue1':
      return { name: indexed('Ligue 1+', text.replace(/\bligue\s*1\b/, '')), groups: ['sport'] };
    case 'bein':
      return {
        name: indexed(/\bmax\b/.test(text) ? 'beIN Sports MAX' : 'beIN Sports', text),
        groups: ['sport'],
      };
    case 'dazn':
      return { name: indexed('DAZN', text), groups: ['sport'] };
    case 'rmc-sport': {
      const station = rmcStation(channel);
      const live = station.match(/\blive (\d+)/)?.[1];
      if (live) return { name: `RMC Sport Live ${Number(live)}`, groups: ['sport'] };
      if (/\baccess\b/.test(station))
        return { name: indexed('RMC Sport Access', station), groups: ['sport'] };
      return { name: indexed('RMC Sport', station), groups: ['sport'] };
    }
    case 'rmc': {
      const station = rmcStation(channel);
      if (/\bstory\b/.test(station)) return { name: 'RMC Story', number: 23, groups: ['docs'] };
      if (/\bdecouverte\b/.test(station))
        return { name: 'RMC Découverte', number: 24, groups: ['docs'] };
      if (/\blife\b/.test(station)) return { name: 'RMC Life', groups: ['docs'] };
      return { name: channel.name, groups: ['docs'] };
    }
  }
}

const pad = (n: number) => String(n).padStart(3, '0');

/**
 * The France preset as shown in Zapp: the channels of buildFrenchBouquets renamed ("TF1", not
 * "VIP: TF1 ᴿᴬᵂ"), renumbered with French numbers (TNT 1–27, then one range per bouquet) and
 * sorted by number. Ids, streams and EPG ids stay intact; each channel gains its bouquet (none
 * for the TNT) and its groups.
 */
export function frenchLineup(channels: readonly Channel[]) {
  const bouquets = buildFrenchBouquets(channels);
  const byId = new Map(channels.map((c) => [c.id, c]));
  const taken = new Set<number>();
  const entries: { channel: Channel; bouquet: FrenchBouquet; station: Station }[] = [];
  for (const b of bouquets) {
    for (const id of b.channels) {
      const station = present(byId.get(id)!, b.id);
      // Two stations claiming the same official number: the first one keeps it.
      if (station.number !== undefined && taken.has(station.number)) delete station.number;
      if (station.number !== undefined) taken.add(station.number);
      entries.push({ channel: byId.get(id)!, bouquet: b.id, station });
    }
  }
  const free = (from: number) => {
    let n = from;
    while (taken.has(n)) n++;
    taken.add(n);
    return n;
  };
  const lineup: Channel[] = entries.map(({ channel, bouquet, station }) => ({
    ...channel,
    name: station.name,
    number: pad(station.number ?? free(bouquet === 'tnt' ? TNT_EXTRA_BASE : BOUQUET_BASE[bouquet])),
    ...(bouquet === 'tnt' ? {} : { bouquet }),
    groups: station.groups,
  }));
  lineup.sort((a, b) => Number(a.number) - Number(b.number));
  return { channels: lineup, bouquets };
}
