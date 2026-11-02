import { describe, expect, it } from 'vitest';
import { categorize, keepGroup } from './categories';

describe('categorize', () => {
  it('maps provider groups by keyword, accents and case ignored', () => {
    expect(categorize('FR | SPORTS HD')).toBe('sport');
    expect(categorize('Cinéma & Séries')).toBe('cinema');
    expect(categorize('FR| INFOS')).toBe('info');
    expect(categorize('Documentaires')).toBe('info');
    expect(categorize('KIDS')).toBe('jeunesse');
    expect(categorize('Musique')).toBe('musique');
  });

  it('defaults to entertainment', () => {
    expect(categorize('FR | GENERALISTES')).toBe('divert');
    expect(categorize('')).toBe('divert');
  });

  it('avoids known false positives', () => {
    expect(categorize('IT | SERIE A')).toBe('divert');
    expect(categorize('GEORGIA')).toBe('divert');
    expect(categorize('FR | SÉRIES')).toBe('cinema');
    expect(categorize('National Geo')).toBe('info');
  });

  it('matches at word starts only', () => {
    expect(categorize('Transport TV')).toBe('divert');
  });

  it('accepts a custom table', () => {
    expect(
      categorize('Ligue 1', { sport: ['ligue'], cinema: [], info: [], jeunesse: [], musique: [] }),
    ).toBe('sport');
  });
});

describe('keepGroup', () => {
  it('keeps everything without a filter', () => {
    expect(keepGroup('UK | NEWS', [])).toBe(true);
  });

  it('keeps groups containing a filter entry', () => {
    expect(keepGroup('FR | SPORTS', ['fr'])).toBe(true);
    expect(keepGroup('UK | NEWS', ['FR', 'BE'])).toBe(false);
    expect(keepGroup('Belgique', ['belgique'])).toBe(true);
  });

  it('matches whole words', () => {
    expect(keepGroup('AFRICA', ['FR'])).toBe(false);
    expect(keepGroup('UKRAINE', ['UK'])).toBe(false);
    expect(keepGroup('FR | SPORTS HD', ['fr sports'])).toBe(true);
  });
});
