import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { ActionAnalysis, AnalyzeHandResponse, GameRulesRequest, RiskProfile } from './models/blackjack-analysis.models';
import { BlackjackTableState, CardTarget, CardValue } from './models/blackjack-table.models';
import { BlackjackAnalysisService } from './services/blackjack-analysis.service';
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
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
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
  visualRoundPhase: VisualRoundPhase = 'shoe_active';
  doubleCardPending = false;
  playerCardsLocked = false;

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
      return 'dealer/reveal';
    }
    if (this.visualRoundPhase === 'round_finished') {
      return 'rodada finalizada';
    }
    return 'jogador em decisao';
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
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Shoe iniciado. Escolha um destino e registre as cartas observadas.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
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
      return;
    }

    if (this.tableState.selectedTarget === 'player' && this.playerCardsLocked) {
      this.cardRegistrationError = 'Mao do jogador bloqueada apos Double. Continue com fluxo de reveal do dealer.';
      return;
    }

    const result = registerCardAction(this.tableState, value, this.tableState.selectedTarget);
    this.tableState = result.state;
    this.cardRegistrationError = result.ok ? '' : result.error ?? 'Falha ao registrar carta.';
    this.analysisError = '';

    if (result.ok && this.tableState.selectedTarget === 'player' && this.doubleCardPending) {
      this.doubleCardPending = false;
      this.playerCardsLocked = true;
      this.actionGuidance =
        'Carta unica do Double registrada. A mao do jogador foi bloqueada para novas compras nesta rodada.';
    }
  }

  undoLastCard(): void {
    const result = undoLastRegisteredCard(this.tableState);
    this.tableState = result.state;
    this.cardRegistrationError = result.ok ? '' : result.error ?? 'Falha ao desfazer carta.';
    this.analysisError = '';
  }

  resetCurrentRound(): void {
    this.tableState = {
      ...resetRound(this.tableState),
      gamePhase: 'shoe_active',
    };
    this.cardRegistrationError = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Rodada resetada. Reconfigure as cartas da rodada atual.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
  }

  resetCurrentShoe(): void {
    this.tableState = {
      ...resetShoe(this.tableState),
      gamePhase: 'shoe_active',
    };
    this.cardRegistrationError = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Shoe resetado para contagens iniciais.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
  }

  startNextRound(): void {
    this.tableState = startNewRoundKeepingShoe(this.tableState);
    this.cardRegistrationError = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Nova rodada iniciada mantendo o shoe atual.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
  }

  onHit(): void {
    if (this.visualRoundPhase === 'round_finished') {
      this.actionGuidance = 'Rodada finalizada. Use Nova rodada para continuar.';
      return;
    }

    if (this.playerCardsLocked) {
      this.actionGuidance = 'Mao do jogador bloqueada por Double. Registre cartas do dealer.';
      return;
    }

    this.selectTarget('player');
    this.visualRoundPhase = 'shoe_active';
    this.actionGuidance = 'Hit selecionado. Clique na carta comprada para registrar na mao do jogador.';
  }

  onStand(): void {
    if (this.visualRoundPhase === 'round_finished') {
      this.actionGuidance = 'Rodada finalizada. Use Nova rodada para continuar.';
      return;
    }

    this.selectTarget('dealer_revealed');
    this.visualRoundPhase = 'dealer_reveal';
    this.actionGuidance = 'Stand selecionado. Registre as cartas reveladas do dealer.';
  }

  onDouble(): void {
    if (this.visualRoundPhase === 'round_finished') {
      this.actionGuidance = 'Rodada finalizada. Use Nova rodada para continuar.';
      return;
    }

    if (this.playerCardsLocked) {
      this.actionGuidance = 'Double ja aplicado nesta rodada; a mao do jogador esta bloqueada para nova compra.';
      return;
    }

    this.selectTarget('player');
    this.doubleCardPending = true;
    this.visualRoundPhase = 'shoe_active';
    this.actionGuidance =
      'Double selecionado. Registre agora a unica carta adicional do jogador; apos isso a mao sera bloqueada.';
  }

  onSplit(): void {
    this.actionGuidance =
      'Split selecionado. O suporte visual completo a multiplas maos sera disponibilizado em uma proxima etapa.';
  }

  onSurrender(): void {
    this.visualRoundPhase = 'round_finished';
    this.doubleCardPending = false;
    this.playerCardsLocked = false;
    this.actionGuidance =
      'Surrender registrado no fluxo visual. A rodada foi finalizada mantendo o historico de cartas no shoe.';
  }

  analyzeCurrentDecision(): void {
    if (this.tableState.playerCards.length < 2) {
      this.analysisError = 'Analise indisponivel: registre pelo menos 2 cartas do jogador.';
      return;
    }

    if (!this.tableState.dealerUpcard) {
      this.analysisError = 'Analise indisponivel: defina a dealer_upcard antes de analisar.';
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
      this.analysisError = 'Dados insuficientes: informe ao menos 2 cartas para player e 1 dealer_upcard.';
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
        return 'Nao foi possivel conectar a API. Verifique se o backend esta rodando.';
      }

      if (error.status === 422) {
        return 'Entrada invalida. Confira as cartas e os parametros da simulacao.';
      }

      return 'Ocorreu um erro ao processar a analise.';
    }

    return 'Ocorreu um erro ao processar a analise.';
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
