/**
 * Compteur d'utilisation LLM avec gestion des limites
 * Permet de suivre le nombre d'appels et de tokens consommés
 */

export class LLMCounter {
  private _calls: number = 0;
  private _tokens: number = 0;
  private _lastCall: Date | null = null;

  /**
   * Incrémente le compteur après un appel LLM
   * @param tokens Nombre de tokens consommés (input + output)
   */
  addCall(tokens: number): void {
    this._calls++;
    this._tokens += tokens;
    this._lastCall = new Date();
  }

  /**
   * Réinitialise le compteur
   */
  reset(): void {
    this._calls = 0;
    this._tokens = 0;
    this._lastCall = null;
  }

  /**
   * Vérifie si on peut encore faire des appels LLM
   * @param maxCalls Limite maximale d'appels
   * @param maxTokens Limite maximale de tokens
   * @returns true si on peut continuer, false si limite atteinte
   */
  checkLimit(maxCalls: number, maxTokens: number): boolean {
    return this._calls < maxCalls && this._tokens < maxTokens;
  }

  /**
   * Vérifie si un appel spécifique est possible
   * @param additionalTokens Tokens supplémentaires estimés pour le prochain appel
   * @param maxCalls Limite maximale d'appels
   * @param maxTokens Limite maximale de tokens
   * @returns true si l'appel peut être fait
   */
  canMakeCall(additionalTokens: number, maxCalls: number, maxTokens: number): boolean {
    return (
      this._calls + 1 <= maxCalls &&
      this._tokens + additionalTokens <= maxTokens
    );
  }

  /**
   * Obtient l'état actuel
   */
  getState(): { calls: number; tokens: number; lastCall: Date | null } {
    return {
      calls: this._calls,
      tokens: this._tokens,
      lastCall: this._lastCall,
    };
  }

  /**
   * Pourcentage d'utilisation des appels
   */
  getCallsUsage(maxCalls: number): number {
    return (this._calls / maxCalls) * 100;
  }

  /**
   * Pourcentage d'utilisation des tokens
   */
  getTokensUsage(maxTokens: number): number {
    return (this._tokens / maxTokens) * 100;
  }

  /**
   * Nombre d'appels restants
   */
  getRemainingCalls(maxCalls: number): number {
    return Math.max(0, maxCalls - this._calls);
  }

  /**
   * Nombre de tokens restants
   */
  getRemainingTokens(maxTokens: number): number {
    return Math.max(0, maxTokens - this._tokens);
  }

  // Getters
  get calls(): number {
    return this._calls;
  }

  get tokens(): number {
    return this._tokens;
  }

  get lastCall(): Date | null {
    return this._lastCall;
  }
}

/**
 * Instance globale du compteur (singleton)
 */
let globalCounter: LLMCounter | null = null;

export function getGlobalLLMCounter(): LLMCounter {
  if (!globalCounter) {
    globalCounter = new LLMCounter();
  }
  return globalCounter;
}

export function resetGlobalLLMCounter(): void {
  if (globalCounter) {
    globalCounter.reset();
  }
}
