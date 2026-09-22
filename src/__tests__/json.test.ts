import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractJson, extractJobResults } from '../llm/client.js';

const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = () => {};
});
afterAll(() => {
  console.log = originalConsoleLog;
});

describe('extractJson', () => {
  it('extrait un objet JSON isolé', () => {
    expect(extractJson<{ a: number }>('avant { "a": 1 } après')).toEqual({ a: 1 });
  });

  it('extrait un tableau JSON', () => {
    expect(extractJson<number[]>('texte [1, 2, 3] texte')).toEqual([1, 2, 3]);
  });

  it('gère les accolades dans les chaînes', () => {
    expect(extractJson<{ s: string }>('{"s": "contient } une accolade"}')).toEqual({
      s: 'contient } une accolade',
    });
  });

  it('gère les blocs imbriqués', () => {
    const parsed = extractJson<{ jobs: { t: string }[] }>(
      'blabla {"jobs": [{"t": "x"}, {"t": "y"}]} blabla',
    );
    expect(parsed.jobs).toHaveLength(2);
  });

  it('saute un premier bloc invalide et prend le suivant', () => {
    const parsed = extractJson<{ ok: boolean }>(
      '{ invalide } puis {"ok": true}',
    );
    expect(parsed).toEqual({ ok: true });
  });

  it('lève une erreur sans JSON', () => {
    expect(() => extractJson('aucun json ici')).toThrow();
  });

  it('gère les guillemets échappés', () => {
    expect(extractJson<{ s: string }>('{"s": "dit \\"bonjour\\""}')).toEqual({
      s: 'dit "bonjour"',
    });
  });
});

describe('extractJobResults — fallback manuel', () => {
  it('parse le format texte Titre/Entreprise/URL quand le JSON est absent', () => {
    const text = [
      'Titre: Développeur Fullstack',
      'Entreprise: Tech Corp',
      'URL: https://www.welcometothejungle.com/fr/companies/tech/jobs/123',
    ].join('\n');
    const results = extractJobResults(text, 'Test', []);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Développeur Fullstack');
    expect(results[0].company).toBe('Tech Corp');
  });

  it('retombe sur les références si aucun format reconnu', () => {
    const results = extractJobResults('texte brut', 'Test', ['https://www.apec.fr/candidat/offre-1.html']);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.apec.fr/candidat/offre-1.html');
  });
});
