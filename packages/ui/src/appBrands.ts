import bein from './assets/apps/bein.svg?url';
import canal from './assets/apps/canal.svg?url';
import dazn from './assets/apps/dazn.svg?url';
import ligue1 from './assets/apps/ligue1.webp?url';
import rmcSport from './assets/apps/rmc-sport.svg?url';
import rmc from './assets/apps/rmc.svg?url';

/**
 * How a launcher card shows a bouquet, tvOS style: the brand colour fills the card and a vector
 * logo sits on it, sharp at any zoom. SVG logos from Wikimedia Commons; Ligue 1+ is a 2000 px
 * image that already carries its blue background, shown full bleed.
 * `width` is the logo's share of the card width.
 */
export interface AppBrand {
  logo: string;
  background: string;
  width: number;
}

export const APP_BRANDS: Record<string, AppBrand> = {
  canal: { logo: canal, background: '#000000', width: 0.72 },
  ligue1: { logo: ligue1, background: '#0960ff', width: 1 },
  bein: { logo: bein, background: '#5c2d91', width: 0.92 },
  dazn: { logo: dazn, background: '#0c161c', width: 0.56 },
  'rmc-sport': { logo: rmcSport, background: '#ffffff', width: 0.7 },
  rmc: { logo: rmc, background: '#db0034', width: 0.7 },
};
