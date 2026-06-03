import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { ActionAnalysis, AnalyzeHandResponse, GameRulesRequest, RiskProfile } from './models/blackjack-analysis.models';
import { BlackjackTableState, CardTarget, CardValue } from './models/blackjack-table.models';
import { BlackjackAnalysisService } from './services/blackjack-analysis.service';
import { InfoTooltipComponent } from './components/info-tooltip/info-tooltip.component';
import {
  buildAnalyzeHandRequest,
  createInitialTableState,
  getTotalRemainingCards,
  registerCardAction,
  resetRound,
  resetShoe,
  startNewRoundKeepingShoe,
  undoLastRegisteredCard,
} from './utils/blackjack-table.utils';

interface TableSetupConfig {
  number_of_decks: number;
  dealer_hits_soft_17: boolean;
  blackjack_payout: '3:2' | '6:5';
  double_allowed: boolean;
  double_after_split: boolean;
  surrender_allowed: boolean;
  max_splits: number;
  dealer_peek: boolean;
  simulations: number;
  seed: number;
  bankroll: number;
  minimum_bet: number;
  risk_profile: RiskProfile;
}

type VisualRoundPhase = 'shoe_active' | 'dealer_reveal' | 'round_finished';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, InfoTooltipComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly cardTargetLabels: Record<CardTarget, string> = {
    player: 'Jogador',
    dealer_upcard: 'Carta aberta do dealer',
    seen: 'Cartas vistas',
    dealer_revealed: 'Cartas reveladas do dealer',
  };

  readonly actionLabels: Record<ActionAnalysis['action'], string> = {
    hit: 'Pedir carta',
    stand: 'Parar',
    double: 'Dobrar',
    split: 'Dividir',
    surrender: 'Render-se',
  };

  readonly gamePhaseLabels: Record<BlackjackTableState['gamePhase'], string> = {
    table_setup: 'Configuração da mesa',
    shoe_active: 'Shoe ativo',
    analysis_ready: 'Pronto para análise',
  };

  readonly riskProfileLabels: Record<RiskProfile, string> = {
    conservative: 'Conservador',
    moderate: 'Moderado',
    aggressive: 'Agressivo',
  };

  readonly defaultConfig: TableSetupConfig = {
    number_of_decks: 6,
    dealer_hits_soft_17: false,
    blackjack_payout: '3:2',
    double_allowed: true,
    double_after_split: true,
    surrender_allowed: false,
    max_splits: 3,
    dealer_peek: true,
    simulations: 50000,
    seed: 42,
    bankroll: 1000,
    minimum_bet: 10,
    risk_profile: 'moderate',
  };

  config: TableSetupConfig = { ...this.defaultConfig };
  tableState: BlackjackTableState = createInitialTableState(this.defaultConfig.number_of_decks);
  savedRules: GameRulesRequest | null = null;
  cardRegistrationError = '';
  analysisError = '';
  analysisLoading = false;
  analysisResponse: AnalyzeHandResponse | null = null;
  actionGuidance = '';
  cardRegistrationFeedback = '';
  visualRoundPhase: VisualRoundPhase = 'shoe_active';
  doubleCardPending = false;
  playerCardsLocked = false;
  shoeNumber = 0;
  recentRegisteredCardValue: CardValue | null = null;

  readonly cardTargets: CardTarget[] = ['player', 'dealer_upcard', 'seen', 'dealer_revealed'];
  readonly priorityActionOrder: ActionAnalysis['action'][] = ['hit', 'stand', 'double', 'split'];

  constructor(private readonly blackjackAnalysisService: BlackjackAnalysisService) {}

  get isSetupPhase(): boolean {
    return this.tableState.gamePhase === 'table_setup';
  }

  get remainingCards(): number {
    return getTotalRemainingCards(this.tableState);
  }

  get registeredCardsCount(): number {
    return this.tableState.history.length;
  }

  get countingData() {
    return this.analysisResponse?.counting ?? null;
  }

  get bettingData() {
    return this.analysisResponse?.betting ?? null;
  }

  get canAnalyzeCurrentDecision(): boolean {
    return this.tableState.playerCards.length >= 2 && this.tableState.dealerUpcard !== null;
  }

  get visualPhaseLabel(): string {
    if (this.visualRoundPhase === 'dealer_reveal') {
      return 'Revelação das cartas do dealer';
    }
    if (this.visualRoundPhase === 'round_finished') {
      return 'Rodada finalizada';
    }
    return 'Jogador em decisão';
  }

  get decisionRanking(): ActionAnalysis[] {
    return this.analysisResponse?.actions ?? [];
  }

  get recommendedAction(): ActionAnalysis['action'] | null {
    return this.analysisResponse?.recommendation?.best_action ?? null;
  }

  get recommendedActionAnalysis(): ActionAnalysis | null {
    if (!this.recommendedAction) {
      return null;
    }
    return this.getActionByName(this.recommendedAction);
  }

  get hasSurrenderAction(): boolean {
    return this.getActionByName('surrender') !== null;
  }

  startShoe(): void {
    this.savedRules = {
      number_of_decks: this.config.number_of_decks,
      dealer_hits_soft_17: this.config.dealer_hits_soft_17,
      blackjack_payout: this.config.blackjack_payout,
      double_allowed: this.config.double_allowed,
      double_after_split: this.config.double_after_split,
      surrender_allowed: this.config.surrender_allowed,
      max_splits: this.config.max_splits,
      dealer_peek: this.config.dealer_peek,
    };

    const initializedState = createInitialTableState(this.config.number_of_decks);
    this.tableState = {
      ...initializedState,
      gamePhase: 'shoe_active',
    };
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Shoe iniciado. Escolha onde registrar a próxima carta observada.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
    this.shoeNumber = 1;
    this.recentRegisteredCardValue = null;
  }

  selectTarget(target: CardTarget): void {
    this.tableState = {
      ...this.tableState,
      selectedTarget: target,
    };
  }

  registerCard(value: CardValue): void {
    if (this.visualRoundPhase === 'round_finished') {
      this.cardRegistrationError = 'Rodada finalizada. Inicie uma nova rodada para registrar novas cartas.';
      this.cardRegistrationFeedback = '';
      return;
    }

    if (this.tableState.selectedTarget === 'player' && this.playerCardsLocked) {
      this.cardRegistrationError = 'Mão do jogador bloqueada após Dobrar. Continue registrando as cartas do dealer.';
      this.cardRegistrationFeedback = '';
      return;
    }

    const result = registerCardAction(this.tableState, value, this.tableState.selectedTarget);
    this.tableState = result.state;
    this.cardRegistrationError = result.ok ? '' : result.error ?? 'Falha ao registrar carta.';
    this.cardRegistrationFeedback = result.ok
      ? `${this.getCardPrimaryDisplay(value)} registrada em ${this.getCardTargetLabel(this.tableState.selectedTarget)}.`
      : '';
    this.recentRegisteredCardValue = result.ok ? value : null;
    this.analysisError = '';

    if (result.ok && this.tableState.selectedTarget === 'player' && this.doubleCardPending) {
      this.doubleCardPending = false;
      this.playerCardsLocked = true;
      this.actionGuidance =
        'Carta única da ação Dobrar registrada. A mão do jogador foi bloqueada para novas compras nesta rodada.';
    }
  }

  undoLastCard(): void {
    const result = undoLastRegisteredCard(this.tableState);
    this.tableState = result.state;
    this.cardRegistrationError = result.ok ? '' : result.error ?? 'Falha ao desfazer carta.';
    this.cardRegistrationFeedback = result.ok ? 'Última carta desfeita.' : '';
    this.recentRegisteredCardValue = null;
    this.analysisError = '';
  }

  resetCurrentRound(): void {
    this.tableState = {
      ...resetRound(this.tableState),
      gamePhase: 'shoe_active',
    };
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Rodada reiniciada. Registre novamente as cartas da rodada atual.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
    this.recentRegisteredCardValue = null;
  }

  resetCurrentShoe(): void {
    const shouldResetShoe = window.confirm(
      'Isso vai zerar cartas vistas, contagem e restaurar o shoe completo. Deseja continuar?',
    );

    if (!shouldResetShoe) {
      return;
    }

    this.tableState = {
      ...resetShoe(this.tableState),
      gamePhase: 'shoe_active',
    };
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Shoe reiniciado com as contagens iniciais.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
    this.shoeNumber += 1;
    this.recentRegisteredCardValue = null;
  }

  startNextRound(): void {
    this.tableState = startNewRoundKeepingShoe(this.tableState);
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Nova rodada iniciada mantendo o shoe atual.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
    this.recentRegisteredCardValue = null;
  }

  onHit(): void {
    if (this.visualRoundPhase === 'round_finished') {
      this.actionGuidance = 'Rodada finalizada. Use Nova rodada para continuar.';
      return;
    }

    if (this.playerCardsLocked) {
      this.actionGuidance = 'Mão do jogador bloqueada por Dobrar. Registre as cartas do dealer.';
      return;
    }

    this.selectTarget('player');
    this.visualRoundPhase = 'shoe_active';
    this.actionGuidance = 'Pedir carta selecionado. Clique na carta comprada para registrar na mão do jogador.';
  }

  onStand(): void {
    if (this.visualRoundPhase === 'round_finished') {
      this.actionGuidance = 'Rodada finalizada. Use Nova rodada para continuar.';
      return;
    }

    this.selectTarget('dealer_revealed');
    this.visualRoundPhase = 'dealer_reveal';
    this.actionGuidance = 'Parar selecionado. Registre as cartas reveladas do dealer.';
  }

  onDouble(): void {
    if (this.visualRoundPhase === 'round_finished') {
      this.actionGuidance = 'Rodada finalizada. Use Nova rodada para continuar.';
      return;
    }

    if (this.playerCardsLocked) {
      this.actionGuidance = 'Dobrar já foi aplicado nesta rodada; a mão do jogador está bloqueada para nova compra.';
      return;
    }

    this.selectTarget('player');
    this.doubleCardPending = true;
    this.visualRoundPhase = 'shoe_active';
    this.actionGuidance =
      'Dobrar selecionado. Registre agora a única carta adicional do jogador; depois disso a mão será bloqueada.';
  }

  onSplit(): void {
    this.actionGuidance =
      'Dividir selecionado. O suporte visual completo a múltiplas mãos será disponibilizado em uma próxima etapa.';
  }

  onSurrender(): void {
    this.visualRoundPhase = 'round_finished';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
    this.actionGuidance =
      'Render-se registrado no fluxo visual. A rodada foi finalizada mantendo o histórico de cartas no shoe.';
  }

  analyzeCurrentDecision(): void {
    if (this.tableState.playerCards.length < 2) {
      this.analysisError = 'Análise indisponível: registre pelo menos 2 cartas do jogador.';
      return;
    }

    if (!this.tableState.dealerUpcard) {
      this.analysisError = 'Análise indisponível: defina a carta aberta do dealer antes de analisar.';
      return;
    }

    const payload = buildAnalyzeHandRequest(this.tableState, {
      rules: {
        number_of_decks: this.config.number_of_decks,
        dealer_hits_soft_17: this.config.dealer_hits_soft_17,
        blackjack_payout: this.config.blackjack_payout,
        double_allowed: this.config.double_allowed,
        double_after_split: this.config.double_after_split,
        surrender_allowed: this.config.surrender_allowed,
        max_splits: this.config.max_splits,
        dealer_peek: this.config.dealer_peek,
      },
      simulations: this.config.simulations,
      seed: this.config.seed,
      bankroll: this.config.bankroll,
      minimum_bet: this.config.minimum_bet,
      risk_profile: this.config.risk_profile,
    });

    if (!payload) {
      this.analysisError = 'Dados insuficientes: informe ao menos 2 cartas do jogador e 1 carta aberta do dealer.';
      return;
    }

    this.analysisLoading = true;
    this.analysisError = '';
    this.blackjackAnalysisService
      .analyzeHand(payload)
      .pipe(finalize(() => {
        this.analysisLoading = false;
      }))
      .subscribe({
        next: (response) => {
          this.analysisResponse = response;
        },
        error: (error: unknown) => {
          this.analysisResponse = null;
          this.analysisError = this.resolveAnalysisErrorMessage(error);
          console.error('Erro ao processar analise da API:', error);
        },
      });
  }

  private resolveAnalysisErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Não foi possível conectar à API. Verifique se o backend está rodando.';
      }

      if (error.status === 422) {
        return 'Entrada inválida. Confira as cartas e os parâmetros da simulação.';
      }

      return 'Ocorreu um erro ao processar a análise.';
    }

    return 'Ocorreu um erro ao processar a análise.';
  }

  getCardTargetLabel(target: CardTarget): string {
    return this.cardTargetLabels[target];
  }

  getActionLabel(action: ActionAnalysis['action']): string {
    return this.actionLabels[action];
  }

  getActionDisplay(action: ActionAnalysis['action']): string {
    return `${this.getActionLabel(action)} (${action})`;
  }

  formatRankingPosition(index: number): string {
    return `${index + 1}º`;
  }

  getGamePhaseLabel(phase: BlackjackTableState['gamePhase']): string {
    return this.gamePhaseLabels[phase];
  }

  getRiskProfileLabel(profile: RiskProfile | undefined): string {
    return profile ? this.riskProfileLabels[profile] : '-';
  }

  getCardPrimaryDisplay(value: CardValue): string {
    return value;
  }

  getCardAuxiliaryDisplay(value: CardValue): string {
    return value === '10' ? '10/J/Q/K' : '';
  }

  getActionByName(actionName: ActionAnalysis['action']): ActionAnalysis | null {
    return this.analysisResponse?.actions?.find((action) => action.action === actionName) ?? null;
  }

  formatRate(rate: number | undefined): string {
    if (rate === undefined || rate === null) {
      return '-';
    }
    return `${(rate * 100).toFixed(2)}%`;
  }

  formatExpectedValue(ev: number | undefined): string {
    if (ev === undefined || ev === null) {
      return '-';
    }
    const signal = ev > 0 ? '+' : '';
    return `${signal}${ev.toFixed(4)}`;
  }

  formatExecutionTime(executionTimeMs: number | undefined): string {
    if (executionTimeMs === undefined || executionTimeMs === null) {
      return '-';
    }
    return `${executionTimeMs.toFixed(2)} ms`;
  }

  getExpectedValueClass(ev: number | undefined): string {
    if (ev === undefined || ev === null) {
      return 'ev-neutral';
    }
    if (ev > 0) {
      return 'ev-positive';
    }
    if (ev < 0) {
      return 'ev-negative';
    }
    return 'ev-neutral';
  }
}
