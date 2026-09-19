import { AgentPlanner } from "./planner.js";
import { LLMCounter, getGlobalLLMCounter } from "./llmCounter.js";
import { executeTool } from "./tools/index.js";
import { searchWebTool } from "./tools/search.js";
import { fetchPageTool } from "./tools/fetch.js";
import { extractJobsTool } from "./tools/extract.js";
import { scoreJobsTool } from "./tools/score.js";
import { saveResultsTool, markSeenTool, loadSeenTool } from "./tools/storage.js";
import type {
  AgentAction,
  AgentConfig,
  AgentResult,
  AgentState,
  AgentPlan,
} from "./types.js";
import type { JobOffer, ScoredJob } from "../types/index.js";

/**
 * Orchestrateur de l'Agent IA
 * C'est le cerveau qui pilote toute la recherche d'emploi
 */
export class AgentOrchestrator {
  private planner: AgentPlanner;
  private counter: LLMCounter;
  private config: AgentConfig;
  private state: AgentState;

  constructor(config: Partial<AgentConfig> = {}) {
    // Configuration par défaut
    this.config = {
      maxLlmCalls: 20,
      maxTokens: 50000,
      maxSteps: 10,
      maxResultsPerSource: 30,
      satisfactionThreshold: 80,
      minScoreThreshold: 60,
      allowedSites: ["Indeed", "France Travail", "Leboncoin", "LinkedIn"],
      useCache: true,
      parallelRequests: 2,
      ...config,
    };

    this.counter = getGlobalLLMCounter();
    this.counter.reset();
    this.planner = new AgentPlanner({ config: this.config, llmCounter: this.counter });

    // Initialiser l'état
    this.state = {
      goal: "",
      config: this.config as any, // TODO: fix type
      currentStep: 0,
      totalSteps: 0,
      status: "idle",
      results: [],
      rawResults: [],
      triedQueries: [],
      triedUrls: [],
      llmCalls: 0,
      totalTokensUsed: 0,
      satisfaction: 0,
      errors: [],
    };
  }

  /**
   * Exécute une recherche complète pilotée par l'IA
   */
  async run(goal: string): Promise<AgentResult> {
    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const startTime = Date.now();

    // Réinitialiser l'état pour cette recherche
    this.state = {
      goal,
      config: this.config as any,
      currentStep: 0,
      totalSteps: 0,
      status: "planning",
      results: [],
      rawResults: [],
      triedQueries: [],
      triedUrls: [],
      llmCalls: 0,
      totalTokensUsed: 0,
      satisfaction: 0,
      errors: [],
    };

    console.log(`\n=== Agent IA - Recherche: "${goal}" ===`);
    console.log(`Run ID: ${runId}`);
    console.log(`Limites: ${this.config.maxLlmCalls} appels, ${this.config.maxTokens} tokens`);

    try {
      // Étape 1: Générer un plan initial (optionnel, peut être fait à la demande)
      // this.state.plan = await this.planner.generateInitialPlan(goal);
      // console.log(`[orchestrator] Plan généré: ${this.state.plan?.steps.length} étapes`);

      // Étape 2: Boucle principale
      console.log(`[orchestrator] 🚀 Début de la boucle de recherche...`);
      while (this.canContinue()) {
        this.state.currentStep++;
        this.state.status = "searching";

        // Décider de la prochaine action
        console.log(`[orchestrator] 📋 Décision de la prochaine action...`);
        const action = await this.planner.decideNextAction(
          goal,
          this.state.results,
          this.state.triedQueries,
          this.state.llmCalls,
          this.state.totalTokensUsed
        );

        console.log(`[orchestrator] ➡️  Étape ${this.state.currentStep}: ${action.type} - ${action.reason || action.query || action.url || ''}`);

        // Exécuter l'action
        console.log(`[orchestrator] 🔄 Exécution de l'action...`);
        const result = await this.executeAction(action, runId);
        console.log(`[orchestrator] ✅ Action terminée`);

        // Mettre à jour l'état
        this.updateState(action, result, runId);

        // Afficher la progression
        console.log(`[orchestrator] 📊 Progression: ${this.state.results.length} offres trouvées, ${this.state.llmCalls} appels LLM, ~${this.state.totalTokensUsed} tokens`);

        // Vérifier si on doit s'arrêter
        if (action.type === "stop" || !this.canContinue()) {
          console.log(`[orchestrator] 🛑 Arrêt demandé`);
          this.state.status = "stopped";
          break;
        }

        // Pause entre les étapes (pour éviter la surcharge)
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Étape 3: Générer un résumé
      const summary = await this.generateSummary();

      const executionTime = Date.now() - startTime;
      console.log(`\n[orchestrator] Recherche terminée en ${executionTime}ms`);
      console.log(`[orchestrator] Résultats: ${this.state.results.length} offres`);
      console.log(`[orchestrator] Utilisation: ${this.state.llmCalls} appels LLM, ~${this.state.totalTokensUsed} tokens`);

      return {
        runId,
        goal,
        state: this.state,
        jobs: this.state.results,
        totalTokensUsed: this.state.totalTokensUsed,
        totalLlmCalls: this.state.llmCalls,
        executionTime,
        summary,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[orchestrator] Erreur: ${errorMessage}`);
      this.state.errors.push(errorMessage);
      this.state.status = "stopped";

      return {
        runId,
        goal,
        state: this.state,
        jobs: this.state.results,
        totalTokensUsed: this.state.totalTokensUsed,
        totalLlmCalls: this.state.llmCalls,
        executionTime: Date.now() - startTime,
        summary: `Recherche interrompue: ${errorMessage}`,
      };
    }
  }

  /**
   * Vérifie si on peut continuer la recherche
   */
  private canContinue(): boolean {
    // Vérifier les limites
    if (!this.counter.checkLimit(this.config.maxLlmCalls, this.config.maxTokens)) {
      console.log(`[orchestrator] ❌ Limite LLM atteinte: ${this.counter.calls}/${this.config.maxLlmCalls} appels, ${this.counter.tokens}/${this.config.maxTokens} tokens`);
      return false;
    }

    // Vérifier le nombre d'étapes
    if (this.state.currentStep >= this.config.maxSteps) {
      console.log(`[orchestrator] ❌ Nombre maximal d'étapes atteint (${this.state.currentStep}/${this.config.maxSteps})`);
      return false;
    }

    // Vérifier la satisfaction
    if (this.state.satisfaction >= this.config.satisfactionThreshold) {
      console.log(`[orchestrator] ✅ Satisfaction suffisante (${this.state.satisfaction}/100)`);
      return false;
    }

    return true;
  }

  /**
   * Exécute une action
   */
  private async executeAction(action: AgentAction, runId: string): Promise<any> {
    const actionType = action.type;
    console.log(`[orchestrator]   Exécution: ${actionType}`);
    try {
      switch (actionType) {
        case "search":
          console.log(`[orchestrator]   → Recherche: query="${action.query}", site="${action.site}", location="${action.location}"`);
          return await this.executeSearch(action);
        
        case "extract":
          console.log(`[orchestrator]   → Extraction: url="${action.url?.slice(0, 60) || action.html?.slice(0, 40) || '...'}"`);
          return await this.executeExtract(action);
        
        case "score":
          console.log(`[orchestrator]   → Scoring: ${this.state.rawResults.length} offres à scorer`);
          return await this.executeScore(action);
        
        case "refine":
          console.log(`[orchestrator]   → Raffinement: ${action.refinement}`);
          return await this.executeRefine(action);
        
        case "stop":
          console.log(`[orchestrator]   → Arrêt: ${action.reason}`);
          return { success: true, message: action.reason };
        
        default:
          throw new Error(`Type d'action inconnu: ${actionType}`);
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[orchestrator]   ✗ Erreur: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Exécute une action de recherche
   */
  private async executeSearch(action: AgentAction): Promise<any> {
    const { query, site, location = "France", maxResults = 30 } = action;
    console.log(`[orchestrator]   [search] Recherche: "${query}" sur ${site}`);
    
    if (!query) {
      throw new Error("La recherche nécessite un paramètre 'query'");
    }

    // Vérifier si on a déjà essayé cette requête
    const queryKey = `${query}-${site}`;
    const alreadyTried = this.state.triedQueries.some(
      t => `${t.query}-${t.site}` === queryKey
    );
    
    if (alreadyTried) {
      console.log(`[orchestrator]   [search] ⏭️  Requête déjà essayée: ${query} sur ${site}`);
      return { success: true, urls: [], query, site, skipped: true };
    }

    // Exécuter la recherche
    console.log(`[orchestrator]   [search] → Génération des URLs...`);
    const result = await searchWebTool.execute({
      query,
      site,
      location,
      maxResults,
    });
    console.log(`[orchestrator]   [search] ✓ ${result.urls.length} URL(s) générée(s)`);

    // Mettre à jour les requêtes essayées
    this.state.triedQueries.push({
      query,
      site: site || "",
      results: result.urls.length,
    });

    return result;
  }

  /**
   * Exécute une action d'extraction
   */
  private async executeExtract(action: AgentAction): Promise<any> {
    const { url, html } = action;
    console.log(`[orchestrator]   [extract] Début extraction...`);
    
    if (!url && !html) {
      throw new Error("L'extraction nécessite une URL ou du HTML");
    }

    // Vérifier si on a déjà extrait cette URL
    if (url && this.state.triedUrls.includes(url)) {
      console.log(`[orchestrator]   [extract] ⏭️  URL déjà extraite: ${url}`);
      return { success: true, jobs: [], url, skipped: true };
    }

    let pageHtml = html || "";
    let finalUrl = url || "";
    
    // Si on n'a pas le HTML mais qu'on a une URL, le récupérer
    if (!html && url) {
      console.log(`[orchestrator]   [extract] → Récupération de la page: ${url}`);
      const fetchResult = await fetchPageTool.execute({ url });
      pageHtml = fetchResult.html;
      
      // Marquer l'URL comme essayée
      this.state.triedUrls.push(url);
    }

    // Extraire les offres du HTML
    const actionAny = action as any;
    const siteHint = actionAny.site ? String(actionAny.site) : "inconnu";
    console.log(`[orchestrator]   [extract] → Extraction LLM (${pageHtml.length} caractères)...`);
    const result = await extractJobsTool.execute({
      html: pageHtml,
      url: finalUrl,
      siteHint,
      queryContext: this.state.goal,
    });
    console.log(`[orchestrator]   [extract] ✓ ${result.jobs?.length || 0} offre(s) extraite(s)`);

    return result;
  }

  /**
   * Exécute une action de scoring
   */
  private async executeScore(action: AgentAction): Promise<any> {
    // Scorer toutes les offres brutes non encore scorées
    const jobsToScore = this.state.rawResults.filter(
      j => !this.state.results.some(r => r.id === j.id || r.url === j.url)
    );

    if (jobsToScore.length === 0) {
      console.log(`[orchestrator]   [score] ⏭️  Aucune offre à scorer`);
      return { success: true, scoredJobs: [], skipped: true };
    }

    console.log(`[orchestrator]   [score] → Scoring de ${jobsToScore.length} offre(s)...`);
    const result = await scoreJobsTool.execute({
      jobs: jobsToScore,
      criteria: {
        query: this.state.goal.split(" ")[0], // Extraire le premier mot
        location: "France",
        keywords: [],
        excludeKeywords: [],
        minScore: this.config.minScoreThreshold,
      },
    });
    console.log(`[orchestrator]   [score] ✓ ${result.scoredJobs?.length || 0} offre(s) scorée(s)`);

    return result;
  }

  /**
   * Exécute une action de raffinement
   */
  private async executeRefine(action: AgentAction): Promise<any> {
    // Pour l'instant, on ne fait rien de spécial
    // Plus tard: on pourrait demander à l'LLM de suggérer de nouveaux critères
    console.log(`[orchestrator] Raffinement: ${action.refinement}`);
    return { success: true };
  }

  /**
   * Met à jour l'état après une action
   */
  private updateState(action: AgentAction, result: any, runId: string): void {
    // Mettre à jour le compteur LLM
    this.state.llmCalls = this.counter.calls;
    this.state.totalTokensUsed = this.counter.tokens;

    // Traiter les résultats selon l'action
    switch (action.type) {
      case "search":
        // Pas de résultats directs, mais on garde les URLs
        if (result?.urls) {
          this.state.triedQueries.forEach(t => {
            if (t.query === action.query && t.site === action.site) {
              t.results = result.urls.length;
            }
          });
        }
        break;

      case "extract":
        if (result?.jobs && result.jobs.length > 0) {
          // Ajouter les offres brutes
          const newJobs = result.jobs.filter(
            (j: JobOffer) => !this.state.rawResults.some(
              r => r.id === j.id || r.url === j.url
            )
          );
          this.state.rawResults.push(...newJobs);
          
          console.log(`[orchestrator] +${newJobs.length} nouvelles offres brutes`);
        }
        break;

      case "score":
        if (result?.scoredJobs && result.scoredJobs.length > 0) {
          // Ajouter les offres scorées
          const newScoredJobs = result.scoredJobs.filter(
            (j: ScoredJob) => !this.state.results.some(
              r => r.id === j.id || r.url === j.url
            )
          );
          this.state.results.push(...newScoredJobs);
          
          // Calculer la satisfaction
          this.calculateSatisfaction();
          
          console.log(`[orchestrator] +${newScoredJobs.length} nouvelles offres scorées`);
        }
        break;

      case "stop":
        this.state.status = "stopped";
        break;
    }

    // Sauvegarder les résultats périodiquement
    if (this.state.results.length > 0 && this.state.results.length % 5 === 0) {
      this.saveResultsInProgress(runId);
    }
  }

  /**
   * Calcule le niveau de satisfaction
   */
  private calculateSatisfaction(): void {
    if (this.state.results.length === 0) {
      this.state.satisfaction = 0;
      return;
    }

    // Satisfaction basée sur:
    // - Nombre d'offres
    // - Score moyen
    // - Parcours des limites
    const avgScore = this.state.results.reduce((sum, j) => sum + j.score, 0) / this.state.results.length;
    const resultsRatio = Math.min(1, this.state.results.length / (this.config.maxResultsPerSource * 2));
    const scoreRatio = avgScore / 100;
    
    this.state.satisfaction = Math.round(
      (resultsRatio * 0.4 + scoreRatio * 0.6) * 100
    );
  }

  /**
   * Sauvegarde les résultats en cours (pour la persistance)
   */
  private async saveResultsInProgress(runId: string): Promise<void> {
    try {
      await saveResultsTool.execute({
        jobs: this.state.results,
        runId,
      });
    } catch (error) {
      console.warn(`[orchestrator] Échec de sauvegarde intermédiaire: ${(error as Error).message}`);
    }
  }

  /**
   * Génère un résumé final avec LLM
   */
  private async generateSummary(): Promise<string> {
    if (this.state.results.length === 0) {
      return "Aucune offre d'emploi trouvée.";
    }

    const { chat } = await import("../llm/client.js");
    
    const topResults = this.state.results.slice(0, 5);
    const summaryPrompt = `Résumé la recherche d'emploi pour: "${this.state.goal}"

Offres trouvées: ${this.state.results.length}
Top 5 offres:
${topResults.map((j, i) => 
  `${i + 1}. [${j.score}/100] ${j.title} - ${j.company || "Inconnu"} (${j.location || "Lieu inconnu"})`
).join("\n")}

Génère un résumé court (2-3 phrases) en français.`;

    try {
      const result = await chat([
        { role: "system", content: "Tu es un assistant qui génère des résumés concis." },
        { role: "user", content: summaryPrompt },
      ]);
      return result.trim();
    } catch {
      // Fallback
      return `Trouvé ${this.state.results.length} offres d'emploi. ` +
             `Score moyen: ${Math.round(this.state.results.reduce((s, j) => s + j.score, 0) / this.state.results.length)}`;
    }
  }

  /**
   * Obtient l'état actuel
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Obtient le compteur LLM
   */
  getCounter(): LLMCounter {
    return this.counter;
  }

  /**
   * Réinitialise l'agent
   */
  reset(): void {
    this.counter.reset();
    this.state = {
      goal: "",
      config: this.config as any,
      currentStep: 0,
      totalSteps: 0,
      status: "idle",
      results: [],
      rawResults: [],
      triedQueries: [],
      triedUrls: [],
      llmCalls: 0,
      totalTokensUsed: 0,
      satisfaction: 0,
      errors: [],
    };
  }

  /**
   * Exécute une recherche simple (sans boucle) pour compatibilité
   */
  async runSimple(goal: string): Promise<ScoredJob[]> {
    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    
    // Extraire requête et lieu
    const match = goal.match(/^(.*?)\s+(?:à|en|dans)\s+([^\s]+)/i);
    const query = match ? match[1] : goal;
    const location = match ? match[2] : "France";

    // 1. Chercher des URLs
    const searchResult = await searchWebTool.execute({
      query,
      location,
    });

    // 2. Pour chaque URL, extraire les offres
    const allJobs: JobOffer[] = [];
    for (const url of searchResult.urls.slice(0, 2)) { // Limiter à 2 pour éviter trop d'appels
      try {
        const fetchResult = await fetchPageTool.execute({ url });
        const extractResult = await extractJobsTool.execute({
          html: fetchResult.html,
          url,
          siteHint: "inconnu",
          queryContext: goal,
        });
        allJobs.push(...extractResult.jobs);
      } catch (error) {
        console.error(`[runSimple] Erreur sur ${url}: ${(error as Error).message}`);
      }
    }

    // 3. Scorer les offres
    if (allJobs.length > 0) {
      const scoreResult = await scoreJobsTool.execute({
        jobs: allJobs,
        criteria: {
          query,
          location,
          keywords: [],
          excludeKeywords: [],
          minScore: this.config.minScoreThreshold,
        },
      });
      
      // Sauvegarder
      await saveResultsTool.execute({
        jobs: scoreResult.scoredJobs,
        runId,
      });

      return scoreResult.scoredJobs;
    }

    return [];
  }
}

// Export singleton pour usage facile
export const agent = new AgentOrchestrator();
