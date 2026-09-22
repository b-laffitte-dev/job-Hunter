import { describe, it, expect } from 'vitest';
import {
  getDefaultState,
  applyInterpretation,
  isSearchRequest,
} from '../llm/chat.js';
import type { ChatState } from '../types/index.js';

const baseState: ChatState = {
  search: {
    query: 'développeur',
    location: 'Paris',
    maxResults: 10,
  },
};

describe('getDefaultState', () => {
  it('retourne des critères vides avec la France par défaut', () => {
    const s = getDefaultState();
    expect(s.search.query).toBe('');
    expect(s.search.location).toBe('France');
    expect(s.search.maxResults).toBe(10);
  });
});

describe('applyInterpretation', () => {
  it('applique uniquement les champs modifiés', () => {
    const next = applyInterpretation(baseState, {
      action: 'update',
      reply: '',
      location: 'Lyon',
    });
    expect(next.search.query).toBe('développeur');
    expect(next.search.location).toBe('Lyon');
    expect(next.search.maxResults).toBe(10);
  });

  it('ignore les valeurs nulles', () => {
    const next = applyInterpretation(baseState, {
      action: 'update',
      reply: '',
      query: null,
      location: null,
      maxResults: null,
    });
    expect(next).toEqual(baseState);
  });

  it('ne mute pas l\u2019état source', () => {
    const next = applyInterpretation(baseState, {
      action: 'update',
      reply: '',
      query: 'data engineer',
    });
    expect(baseState.search.query).toBe('développeur');
    expect(next.search.query).toBe('data engineer');
  });
});

describe('isSearchRequest', () => {
  it('détecte les déclencheurs de recherche', () => {
    expect(isSearchRequest('lance la recherche')).toBe(true);
    expect(isSearchRequest('trouve des offres de secrétariat')).toBe(true);
    expect(isSearchRequest('cherche un emploi à Lyon')).toBe(true);
    expect(isSearchRequest('go')).toBe(true);
  });

  it('ignore les messages sans déclencheur', () => {
    expect(isSearchRequest('bonjour')).toBe(false);
    expect(isSearchRequest('merci beaucoup')).toBe(false);
    expect(isSearchRequest('')).toBe(false);
  });
});
