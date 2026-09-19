import { chat, extractJson } from "../llm/client.js";
import { LLMCounter, getGlobalLLMCounter } from "./llmCounter.js";
import type { 
  AgentAction, 
  AgentContext, 
  AgentPlan, 
  LLMPlanResponse,
  AgentConfig,
} from "./types.js";

/**
 * Planificateur IA : génère et gère le plan d'exécution
 * C'est ici que l'IA décide de la stratégie de recherche
 */

interface PlannerOptions {
  config: AgentConfig;
  llmCounter?: LLMCounter;
}

export class AgentPlanner {
  private counter: LLMCounter;
  private config: AgentConfig;

  constructor(options: PlannerOptions) {
    this.counter = options.llmCounter || getGlobalLLMCounter();
    this.config = options.config;
  }

  /**
   * Génère un plan initial pour une nouvelle recherche
   */
  async generateInitialPlan(goal: string): Promise<AgentPlan> {
    const context = this.buildContext(goal, [], [], 0, 0);
    
    // Appeler LLM pour générer un plan
    const plan = await this.generatePlanWithLLM(context);
    
    // Calculer le coût estimé
    const estimatedCost = this.estimatePlanCost(plan.steps);
    
    return {
      ...plan,
      estimatedCost,
    };
  }

  /**
   * Décide de la prochaine action à exécuter
   */
  async decideNextAction(
    goal: string,
    currentResults: any[],
    triedQueries: Array<{ query: string; site: string; results: number }>,
    llmCallsUsed: number,
    tokensUsed: number
  ): Promise<AgentAction> {
    const context = this.buildContext(
      goal,
      currentResults,
      triedQueries,
      llmCallsUsed,
      tokensUsed
    );

    // Vérifier les limites avant de continuer
    if (!this.counter.checkLimit(this.config.maxLlmCalls, this.config.maxTokens)) {
      console.log(
        `[planner] Limite atteinte: ${this.counter.calls}/${this.config.maxLlmCalls} appels, ` +
        `${this.counter.tokens}/${this.config.maxTokens} tokens`
      );
      return { type: "stop", reason: "Limite LLM atteinte" };
    }

    // Appeler LLM pour décider de la prochaine action
    const response = await this.decideWithLLM(context);
    
    // Valider et retourner l'action
    return this.validateAction(response.nextAction, context);
  }

  /**
   * Construit le contexte pour l'LLM
   */
  private buildContext(
    goal: string,
    currentResults: any[],
    triedQueries: Array<{ query: string; site: string; results: number }>,
    llmCallsUsed: number,
    tokensUsed: number
  ): AgentContext {
    return {
      goal,
      currentResults,
      triedQueries,
      llmCallsUsed,
      maxLlmCalls: this.config.maxLlmCalls,
      tokensUsed,
      maxTokens: this.config.maxTokens,
      availableSites: this.config.allowedSites || ["Indeed", "France Travail", "Leboncoin", "LinkedIn"],
    };
  }

  /**
   * Génère un plan avec LLM
   */
  private async generatePlanWithLLM(context: AgentContext): Promise<Omit<AgentPlan, "estimatedCost">> {
    const systemPrompt = `Tu es un expert en recherche d'emploi. 
Ton rôle est de créer un plan de recherche optimisé pour trouver des offres d'emploi pertinentes.

Analyse l'objectif suivant et génère un plan détaillé.

Contexte:
- Objectif: "${context.goal}"
- Sites disponibles: ${context.availableSites.join(", ")}
- Limites: ${context.maxLlmCalls} appels LLM max, ${context.maxTokens} tokens max

Instructions:
1. Décompose l'objectif en mots-clés et critères
2. Génère une liste d'actions à exécuter
3. Chaque action doit être une des suivantes:
   - "search": Chercher des URLs de pages d'offres
   - "extract": Extraire des offres d'une page
   - "score": Scorer les offres trouvées
   - "refine": Affiner la recherche avec de nouveaux critères
   - "stop": Arrêter la recherche

Format de sortie (JSON valide UNIQUEMENT):
{
  "steps": [
    {
      "type": "search|extract|score|refine|stop",
      "query": "requête de recherche",
      "site": "nom du site (optionnel)",
      "location": "lieu (optionnel)",
      "url": "URL à extraire (pour type=extract)",
      "reason": "explication de cette étape",
      "priority": 0-100
    }
  ],
  "rationale": "explication du plan"
}

Exemple:
{
  "steps": [
    {"type": "search", "query": "développeur TypeScript", "site": "Indeed", "location": "Paris", "reason": "Recherche initiale sur le site le plus populaire", "priority": 100},
    {"type": "search", "query": "développeur TypeScript", "site": "France Travail", "location": "Paris", "reason": "Recherche complémentaire sur le site officiel", "priority": 90},
    {"type": "extract", "url": "...", "reason": "Extraction des offres de la page", "priority": 80}
  ],
  "rationale": "On commence par les sites les plus pertinents pour maximiser les chances de trouver des offres de qualité."
}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { 
        role: "user" as const, 
        content: `Objectif: "${context.goal}"
Sites disponibles: ${JSON.stringify(context.availableSites)}

Génère un plan de recherche.`
      },
    ];

    try {
      const raw = await chat(messages, { temperature: 0.3, maxTokens: 4000 });
      const plan = extractJson<Omit<AgentPlan, "estimatedCost"> & { steps: AgentAction[] }>(raw);
      
      // Mettre à jour le compteur
      const estimatedTokens = 4000; // Estimation
      this.counter.addCall(estimatedTokens);
      
      return plan;
    } catch (error) {
      console.error(`[planner] Erreur de génération de plan: ${(error as Error).message}`);
      
      // Retourner un plan par défaut
      return this.generateDefaultPlan(context.goal);
    }
  }

  /**
   * Décide de la prochaine action avec LLM
   */
  private async decideWithLLM(context: AgentContext): Promise<LLMPlanResponse> {
    const systemPrompt = `Tu es un assistant de recherche d'emploi. 
À chaque étape, tu dois décider de la PROCHAINE action à exécuter pour atteindre l'objectif.

Contexte actuel:
- Objectif: "${context.goal}"
- Offres trouvées jusqu'à présent: ${context.currentResults.length}
- Requêtes essayées: ${JSON.stringify(context.triedQueries.slice(-5))}
- Appels LLM utilisés: ${context.llmCallsUsed}/${context.maxLlmCalls}
- Tokens utilisés: ${context.tokensUsed}/${context.maxTokens}

Actions disponibles:
1. "search" - Chercher de nouvelles URLs (paramètres: query, site, location)
2. "extract" - Extraire des offres d'une page existante (paramètres: url)
3. "score" - Scorer les offres trouvées
4. "refine" - Affiner la recherche avec de nouveaux critères
5. "stop" - Arrêter la recherche (si assez de résultats ou limites atteintes)

Règles:
- Si tu as déjà > 10 offres pertinentes (score > 70), tu peux proposer de stops
- Si tu as atteint 80% des limites LLM, propose de stop ou de refine
- Sois efficace: maximise le rapport pertinence/coût

Format de sortie (JSON valide UNIQUEMENT):
{
  "nextAction": {
    "type": "search|extract|score|refine|stop",
    "query": "...",
    "site": "...",
    "location": "...",
    "url": "...",
    "reason": "explication de cette action"
  },
  "rationale": "explication de la décision",
  "confidence": 0-100,
  "estimatedRemainingSteps": 0-10
}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { 
        role: "user" as const, 
        content: `Objectif: "${context.goal}"
Résultats actuels: ${JSON.stringify(context.currentResults.slice(0, 3))}
Dernières requêtes: ${JSON.stringify(context.triedQueries.slice(-3))}

Quelle est la prochaine action à exécuter ?`
      },
    ];

    try {
      const raw = await chat(messages, { temperature: 0.2, maxTokens: 2000 });
      const response = extractJson<LLMPlanResponse>(raw);
      
      // Mettre à jour le compteur
      const estimatedTokens = 2000; // Estimation
      this.counter.addCall(estimatedTokens);
      
      return response;
    } catch (error) {
      console.error(`[planner] Erreur de décision: ${(error as Error).message}`);
      
      // Retourner une décision par défaut
      return this.generateDefaultAction(context);
    }
  }

  /**
   * Génère un plan par défaut (fallback)
   */
  private generateDefaultPlan(goal: string): Omit<AgentPlan, "estimatedCost"> {
    // Extraire la requête et le lieu du goal
    const match = goal.match(/^(.*?)\s+(?:à|en|dans)\s+([^\s]+)/i);
    const query = match ? match[1] : goal;
    const location = match ? match[2] : "France";

    return {
      steps: [
        {
          type: "search",
          query,
          site: "Indeed",
          location,
          reason: "Recherche initiale sur Indeed",
          priority: 100,
        },
        {
          type: "search",
          query,
          site: "France Travail",
          location,
          reason: "Recherche complémentaire sur France Travail",
          priority: 90,
        },
        {
          type: "search",
          query,
          site: "Leboncoin",
          location,
          reason: "Recherche complémentaire sur Leboncoin",
          priority: 80,
        },
      ],
      rationale: `Plan par défaut pour "${goal}"`,
    };
  }

  /**
   * Génère une action par défaut (fallback)
   */
  private generateDefaultAction(context: AgentContext): LLMPlanResponse {
    const triedSites = context.triedQueries.map(t => t.site);
    const availableSites = context.availableSites.filter(s => !triedSites.includes(s));
    
    if (context.currentResults.length >= 10) {
      // Assez de résultats, on peut stop
      return {
        nextAction: { type: "stop", reason: "Assez de résultats trouvés" },
        rationale: `On a trouvé ${context.currentResults.length} offres, c'est suffisant`,
        confidence: 80,
        estimatedRemainingSteps: 0,
      };
    }

    if (availableSites.length === 0) {
      // Plus de sites disponibles
      return {
        nextAction: { type: "stop", reason: "Tous les sites ont été essayés" },
        rationale: "Tous les sites disponibles ont été explorés",
        confidence: 90,
        estimatedRemainingSteps: 0,
      };
    }

    // Essayer un nouveau site
    const nextSite = availableSites[0];
    return {
      nextAction: {
        type: "search",
        query: context.goal.split(" ")[0],
        site: nextSite,
        location: "France",
        reason: `Essayer le site suivant: ${nextSite}`,
      },
      rationale: `Exploration du site ${nextSite}`,
      confidence: 70,
      estimatedRemainingSteps: availableSites.length,
    };
  }

  /**
   * Valide et nettoie une action générée par LLM
   */
  private validateAction(action: AgentAction, context: AgentContext): AgentAction {
    // Valider le type
    const validTypes = ["search", "extract", "score", "refine", "stop"] as const;
    if (!validTypes.includes(action.type as any)) {
      action.type = "stop";
      action.reason = "Type d'action invalide";
    }

    // Nettoyer les champs
    if (action.query && typeof action.query !== "string") {
      action.query = String(action.query);
    }
    if (action.site && typeof action.site !== "string") {
      action.site = String(action.site);
    }
    if (action.location && typeof action.location !== "string") {
      action.location = String(action.location);
    }
    if (action.url && typeof action.url !== "string") {
      action.url = String(action.url);
    }

    // Vérifier les limites
    if (this.counter.calls >= this.config.maxLlmCalls * 0.9) {
      // On approche de la limite, forcer le stop
      return { type: "stop", reason: "Approche de la limite LLM" };
    }

    return action;
  }

  /**
   * Estime le coût d'un plan
   */
  private estimatePlanCost(steps: AgentAction[]): { llmCalls: number; tokens: number } {
    let llmCalls = 0;
    let tokens = 0;

    for (const step of steps) {
      switch (step.type) {
        case "search":
          // Recherche simple, pas de LLM
          llmCalls += 0;
          tokens += 0;
          break;
        case "extract":
          // Extraction par LLM: ~2000 tokens par page
          llmCalls += 1;
          tokens += 2000;
          break;
        case "score":
          // Scoring: ~200 tokens par offre
          llmCalls += 1;
          tokens += 2000; // Estimation pour 10 offres
          break;
        case "refine":
          // Affinage: ~1000 tokens
          llmCalls += 1;
          tokens += 1000;
          break;
        case "stop":
          // Pas de coût
          break;
      }
    }

    return { llmCalls, tokens };
  }

  /**
   * Vérifie si on doit s'arrêter
   */
  shouldStop(
    currentResults: any[],
    llmCallsUsed: number,
    tokensUsed: number
  ): boolean {
    // Limite LLM atteinte
    if (!this.counter.checkLimit(this.config.maxLlmCalls, this.config.maxTokens)) {
      return true;
    }

    // Assez de résultats
    if (currentResults.length >= this.config.maxResultsPerSource * 3) {
      return true;
    }

    return false;
  }
}
