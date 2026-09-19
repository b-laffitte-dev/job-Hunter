import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isValidUrl,
  extractJobResults,
} from '../llm/client.js';

// Mock console.log to reduce noise in tests
const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = () => {};
});
afterAll(() => {
  console.log = originalConsoleLog;
});

describe('LLM Client Utilities', () => {
  describe('isValidUrl', () => {
    it('should return true for valid job URLs', () => {
      const validUrls = [
        'https://www.glassdoor.fr/Job/france-medecin-job-12345.htm',
        'https://candidat.pole-emploi.fr/offres/12345',
        'https://www.apec.fr/candidat/offre-12345.html',
        'https://www.welcometothejungle.com/fr/jobs/12345',
        'https://www.linkedin.com/jobs/view/12345/',
        'https://fr.indeed.com/viewjob?jk=12345abc',
        'https://www.monster.fr/emploi/offre-12345',
      ];

      validUrls.forEach(url => {
        expect(isValidUrl(url)).toBe(true);
      });
    });

    it('should return false for invalid URLs', () => {
      const invalidUrls = [
        'https://fr.indeed.com/viewjob?jk=abc123def456789xyz', // Letters in jk
        'https://example.com/job?id=0',
        '',
        'null',
        'undefined',
        'not-a-url',
        'http://',
        'https://evil-site.com/job123',
      ];

      invalidUrls.forEach(url => {
        expect(isValidUrl(url)).toBe(false);
      });
    });

    it('should return false for invalid protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('mailto:test@example.com')).toBe(false);
    });
  });

  describe('extractJobResults', () => {
    it('should extract jobs from JSON with "offres" array', () => {
      const text = `
        Voici les résultats :
        
        \`\`\`json
        {
          "offres": [
            {
              "titre": "Développeur Fullstack",
              "entreprise": "Tech Corp",
              "lieu": "Paris",
              "url": "https://www.glassdoor.fr/job1",
              "description": "Poste de développeur",
              "typeContrat": "CDI",
              "salaire": "50k€"
            },
            {
              "titre": "Chef de Projet",
              "entreprise": "IT Solutions",
              "lieu": "Lyon",
              "url": "https://www.glassdoor.fr/job2",
              "description": "Gestion de projets",
              "typeContrat": "CDD",
              "salaire": "60k€"
            }
          ],
          "sources": ["https://example.com"]
        }
        \`\`\`
      `;

      const result = extractJobResults(text, 'Développeur', []);
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Développeur Fullstack');
      expect(result[0].company).toBe('Tech Corp');
      expect(result[0].location).toBe('Paris');
      expect(result[0].url).toBe('https://www.glassdoor.fr/job1');
      expect(result[1].title).toBe('Chef de Projet');
    });

    it('should extract jobs from JSON array', () => {
      const text = `
        \`\`\`json
        [
          {
            "title": "Job 1",
            "company": "Company A",
            "location": "City A",
            "url": "https://example.com/job1"
          }
        ]
        \`\`\`
      `;

      const result = extractJobResults(text, 'Test', []);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Job 1');
    });

    it('should handle markdown code blocks', () => {
      const text = `
        Voici les offres :
        
        \`\`\`markdown
        {
          "offres": [
            {
              "titre": "Poste Medical",
              "url": "https://candidat.pole-emploi.fr/offres/123"
            }
          ]
        }
        \`\`\`
      `;

      const result = extractJobResults(text, 'Médical', []);
      
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://candidat.pole-emploi.fr/offres/123');
    });

    it('should return fallback result for invalid JSON', () => {
      const text = 'No JSON here, just plain text';
      
      const result = extractJobResults(text, 'Test Query', ['https://fallback.com']);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toContain('Test Query');
    });
  });
});
