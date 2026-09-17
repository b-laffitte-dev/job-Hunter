import type { JobOffer, SourceConfig } from "../types/index.js";
import { loadEnv } from "../config/index.js";
import { fetchJson, postForm } from "./http.js";

interface FTTokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const env = loadEnv();
  if (!env.FT_CLIENT_ID || !env.FT_CLIENT_SECRET) {
    throw new Error("France Travail: FT_CLIENT_ID et FT_CLIENT_SECRET requis");
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const token = await postForm<FTTokenResponse>(
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire",
    {
      grant_type: "client_credentials",
      client_id: env.FT_CLIENT_ID,
      client_secret: env.FT_CLIENT_SECRET,
      scope: `api_offresdemploiv2 o2dsoivre ${env.FT_CLIENT_ID} partenaire`,
    },
    {
      headers: {
        // Basic auth requis par l'API France Travail
        Authorization:
          "Basic " +
          Buffer.from(`${env.FT_CLIENT_ID}:${env.FT_CLIENT_SECRET}`).toString("base64"),
      },
    },
  );
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + (token.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

interface FTResult {
  resultats: Array<{
    id?: string;
    intitule?: string;
    description?: string;
    entreprise?: { nom?: string };
    lieuTravail?: { libelle?: string };
    typeContrat?: string;
    typeContratLibelle?: string;
    salaire?: { libelle?: string; commentaire?: string };
    dateCreation?: string;
    dateActualisation?: string;
    alternance?: boolean;
    urlOrigine?: string;
    origineOffre?: { urlOrigine?: string };
  }>;
}

export async function scrapeFranceTravail(
  source: SourceConfig,
  query: string,
  location: string,
  keywords: string[],
  max: number,
): Promise<JobOffer[]> {
  const token = await getToken();
  const env = loadEnv();
  const motsCles = [query, ...keywords].filter(Boolean).join(" ");
  // On envoie plusieurs requêtes partielles pour combiner requête principale + mots-clés
  const queries = [query, ...keywords.slice(0, 3)].filter(Boolean);
  const all: JobOffer[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    if (all.length >= max) break;
    try {
      const data = await fetchJson<FTResult>(
        "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Api-Key": env.FT_CLIENT_ID ?? "",
          },
          query: {
            motsCles: q,
            commune: location !== "France" ? location : "",
            range: `0-${Math.min(max, 149) - 1}`,
            sort: "0",
          },
        },
      );
      for (const r of data.resultats ?? []) {
        const id = r.id ?? r.urlOrigine ?? Math.random().toString(36);
        if (seen.has(id)) continue;
        seen.add(id);
        const url =
          r.urlOrigine ??
          r.origineOffre?.urlOrigine ??
          `https://candidat.francetravail.fr/offres/recherche/detail/${id}`;
        all.push({
          id,
          source: source.name,
          title: r.intitule ?? "(sans titre)",
          company: r.entreprise?.nom ?? null,
          location: r.lieuTravail?.libelle ?? null,
          url,
          description: r.description ? r.description.slice(0, 2000) : null,
          contractType: r.typeContratLibelle ?? r.typeContrat ?? null,
          salary: r.salaire?.libelle ?? r.salaire?.commentaire ?? null,
          publishedAt: r.dateCreation ?? r.dateActualisation ?? null,
          rawFetchedAt: new Date().toISOString(),
        });
        if (all.length >= max) break;
      }
    } catch (e) {
      console.warn(
        `[francetravail] requête "${q}" échouée: ${(e as Error).message}`,
      );
    }
  }
  void motsCles;
  return all;
}
