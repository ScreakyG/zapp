import { expect, it } from 'vitest';
import { XmltvReader } from './xmltv';

const filter = {
  from: new Date('2026-11-03T00:00:00Z'),
  to: new Date('2026-11-04T00:00:00Z'),
  channels: new Set(['beINSports.us', 'ESPN.us']),
  channelNames: new Map([
    ['beINSports.us', 'US:BEIN SPORTS HD'],
    ['ESPN.us', 'US:ESPN USA HD'],
  ]),
};
const programme = (id: string) =>
  `<programme channel="${id}" start="20261103120000 +0000" stop="20261103130000 +0000"><title>${id}</title></programme>`;
it('matches the provider aliases across arbitrary chunk boundaries', () => {
  const xml =
    '<tv><channel id="beinsports.us"><display-name>US: BEIN SPORTS HD</display-name></channel><channel id="espnu.us"><display-name>US: ESPN USA HD</display-name></channel>' +
    programme('beinsports.us') +
    programme('espnu.us') +
    '</tv>';
  for (const size of [1, 7, xml.length]) {
    const reader = new XmltvReader(filter);
    for (let i = 0; i < xml.length; i += size) reader.push(xml.slice(i, i + size));
    expect(reader.end().map((p) => p.channel)).toEqual(['beINSports.us', 'ESPN.us']);
  }
});
it('prefers exact ids and rejects ambiguous names', () => {
  const reader = new XmltvReader(filter);
  reader.push(
    '<tv><channel id="ESPN.us"><display-name>Other</display-name></channel><channel id="a"><display-name>US: BEIN SPORTS HD</display-name><display-name>US: ESPN USA HD</display-name></channel><channel id="b"><display-name>US: BEIN SPORTS HD</display-name></channel>' +
      programme('a') +
      programme('b') +
      programme('ESPN.us') +
      '</tv>',
  );
  expect(reader.end().map((p) => p.channel)).toEqual(['ESPN.us']);
});
