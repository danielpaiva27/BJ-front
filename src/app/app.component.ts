import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { ActionAnalysis, AnalyzeHandResponse, GameRulesRequest, RiskProfile } from './models/blackjack-analysis.models';
import {
  BlackjackTableState,
  CardTarget,
  CardValue,
  GuidedRoundAction,
  GuidedRoundPhase,
  PreRoundAnalysisSnapshot,
} from './models/blackjack-table.models';
import { BlackjackAnalysisService } from './services/blackjack-analysis.service';
import { CardSelectionModalComponent } from './components/card-selection-modal/card-selection-modal.component';
import { InfoTooltipComponent } from './components/info-tooltip/info-tooltip.component';
import {
  buildPreRoundAnalysis,
  buildAnalyzeHandRequest,
  computeLiveShoeCounting,
  createInitialTableState,
  evaluatePlayerHand,
  getAvailablePlayerActions,
  getAllowedCardTargetsForRoundPhase,
  getTotalRemainingCards,
  isGuidedRoundActionAllowed,
  PlayerActionAvailability,
  registerCardAction,
  resetRound,
  resetShoe,
  shouldDealerHit,
  startNewRoundKeepingShoe,
  transitionGuidedRoundPhase,
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
type NaturalBlackjackResult = 'player_win' | 'push';
type RoundOutcome = 'player_win' | 'dealer_win' | 'push';
type RoundResultReason =
  | 'player_bust'
  | 'dealer_bust'
  | 'player_higher_total'
  | 'dealer_higher_total'
  | 'push_equal_total'
  | 'player_natural_blackjack'
  | 'push_natural_blackjack'
  | 'player_surrender';

interface RoundResolution {
  outcome: RoundOutcome;
  reason: RoundResultReason;
  playerTotal: number;
  dealerTotal: number | null;
  playerCards: CardValue[];
  dealerCards: CardValue[];
  hasDoubled: boolean;
  hasSurrendered: boolean;
  hasNaturalBlackjack: boolean;
  isPlayerBust: boolean;
  isDealerBust: boolean;
  isPush: boolean;
  message: string;
}

type SplitHandStatus = 'pending' | 'awaiting_card' | 'active' | 'stood' | 'bust' | 'doubled';

interface SplitHandState {
  cards: CardValue[];
  status: SplitHandStatus;
  hasDoubled: boolean;
}

interface SplitHandResult {
  handIndex: number;
  cards: CardValue[];
  total: number;
  outcome: RoundOutcome | 'bust';
  reason: string;
  hasDoubled: boolean;
  isBust: boolean;
}

interface SplitHandDisplay {
  handIndex: number;
  cards: CardValue[];
  total: number;
  outcome: RoundOutcome | 'bust' | null;
  reason: string;
  hasDoubled: boolean;
  isBust: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, InfoTooltipComponent, CardSelectionModalComponent],
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

  readonly roundPhaseLabels: Record<GuidedRoundPhase, string> = {
    SETUP: 'Setup',
    SHOE_ACTIVE: 'Shoe ativo',
    SEEN_CARDS_SETUP: 'Registro de cartas vistas',
    BETTING_DECISION: 'Aguardando inicio da mao',
    INITIAL_DEAL: 'Distribuicao inicial',
    PLAYER_DECISION: 'Decisao do jogador',
    PLAYER_HIT_PENDING: 'Aguardando carta do jogador',
    PLAYER_DOUBLE_PENDING: 'Aguardando carta unica do Dobrar',
    DEALER_REVEAL_PENDING: 'Aguardando carta oculta do dealer',
    DEALER_TURN: 'Turno do dealer',
    DEALER_DRAW_PENDING: 'Aguardando compra do dealer',
    ROUND_RESULT: 'Resultado da rodada',
    ROUND_ENDED: 'Rodada encerrada',
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
  latestBettingData: AnalyzeHandResponse['betting'] | null = null;
  actionGuidance = '';
  cardRegistrationFeedback = '';
  visualRoundPhase: VisualRoundPhase = 'shoe_active';
  doubleCardPending = false;
  hasDoubled = false;
  playerCardsLocked = false;
  hasSurrendered = false;
  splitCount = 0;
  shoeNumber = 0;
  recentRegisteredCardValue: CardValue | null = null;
  cardModalOpen = false;
  cardModalTitle = '';
  showAwarenessScreen = true;
  awarenessConfirmationChecked = false;
  splitHands: SplitHandState[] = [];
  activeSplitHandIndex: number | null = null;
  splitHandResults: SplitHandResult[] = [];
  isSplitAcesRound = false;
  naturalBlackjackResult: NaturalBlackjackResult | null = null;
  roundResolution: RoundResolution | null = null;
  preRoundAnalysis: PreRoundAnalysisSnapshot | null = null;
  currentRoundPreBetAnalysis: PreRoundAnalysisSnapshot | null = null;
  private preRoundAnalysisSignature = '';

  readonly cardTargets: CardTarget[] = ['player', 'dealer_upcard', 'seen', 'dealer_revealed'];

  constructor(private readonly blackjackAnalysisService: BlackjackAnalysisService) {}

  get currentRoundPhase(): GuidedRoundPhase {
    return this.tableState.roundPhase;
  }

  get isSetupPhase(): boolean {
    return this.currentRoundPhase === 'SETUP';
  }

  get remainingCards(): number {
    return getTotalRemainingCards(this.tableState);
  }

  get liveShoeCounting() {
    return computeLiveShoeCounting(this.tableState);
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

  get nextRoundBettingData() {
    return this.preRoundAnalysis?.betting ?? this.bettingData ?? this.latestBettingData;
  }

  get canAnalyzeCurrentDecision(): boolean {
    if (this.isSplitRoundActive) {
      return false;
    }

    return (
      this.canUseRoundAction('ANALYZE_DECISION') &&
      this.tableState.playerCards.length >= 2 &&
      this.tableState.dealerUpcard !== null
    );
  }

  get isSplitRoundActive(): boolean {
    return this.splitHands.length > 0;
  }

  get activeSplitHand(): SplitHandState | null {
    if (this.activeSplitHandIndex === null) {
      return null;
    }

    return this.splitHands[this.activeSplitHandIndex] ?? null;
  }

  get activeSplitHandLabel(): string {
    if (this.activeSplitHandIndex === null) {
      return 'Mão -';
    }

    return `Mão ${this.activeSplitHandIndex + 1}`;
  }

  get splitHandsDisplay(): SplitHandDisplay[] {
    if (this.splitHandResults.length > 0) {
      return this.splitHandResults.map((hand) => ({
        handIndex: hand.handIndex,
        cards: [...hand.cards],
        total: hand.total,
        outcome: hand.outcome,
        reason: hand.reason,
        hasDoubled: hand.hasDoubled,
        isBust: hand.isBust,
      }));
    }

    return this.splitHands.map((hand, index) => {
      const handEvaluation = evaluatePlayerHand(hand.cards);

      return {
        handIndex: index,
        cards: [...hand.cards],
        total: handEvaluation.total,
        outcome: null,
        reason: this.getSplitHandStatusLabel(hand, index),
        hasDoubled: hand.hasDoubled,
        isBust: hand.status === 'bust' || handEvaluation.isBust,
      };
    });
  }

  get visualPhaseLabel(): string {
    return this.roundPhaseLabels[this.currentRoundPhase];
  }

  get phaseSummaryLabel(): string {
    const gamePhaseLabel = this.getGamePhaseLabel(this.tableState.gamePhase);
    return gamePhaseLabel === this.visualPhaseLabel
      ? gamePhaseLabel
      : `${gamePhaseLabel} · ${this.visualPhaseLabel}`;
  }

  get playerHandEvaluation() {
    if (this.isSplitRoundActive && this.activeSplitHand) {
      return evaluatePlayerHand(this.activeSplitHand.cards);
    }

    return evaluatePlayerHand(this.tableState.playerCards);
  }

  get playerBustDetected(): boolean {
    return this.playerHandEvaluation.isBust;
  }

  get showPlayerBustResultCard(): boolean {
    return this.currentRoundPhase === 'ROUND_RESULT' && this.playerBustDetected && !this.isSplitRoundActive;
  }

  get playerBustResultDescription(): string {
    if (!this.playerBustDetected) {
      return '';
    }

    const handType = this.playerHandEvaluation.isSoft ? 'soft' : 'hard';
    const doubledSuffix = this.roundResolution?.hasDoubled ? ' Mao dobrada nesta rodada.' : '';
    return `Jogador estourou com ${this.playerHandEvaluation.total} pontos (${handType}).${doubledSuffix}`;
  }

  get dealerHandEvaluation(): ReturnType<typeof evaluatePlayerHand> | null {
    if (!this.tableState.dealerUpcard || this.tableState.dealerRevealedCards.length === 0) {
      return null;
    }

    return evaluatePlayerHand(this.dealerCards);
  }

  get dealerShouldDraw(): boolean {
    if (!this.dealerHandEvaluation) {
      return false;
    }

    return shouldDealerHit(this.dealerHandEvaluation, Boolean(this.activeRules.dealer_hits_soft_17));
  }

  get showDealerHandSummary(): boolean {
    return this.dealerHandEvaluation !== null;
  }

  get dealerVisibleCards(): CardValue[] {
    return this.dealerCards;
  }

  get showRoundResolutionCard(): boolean {
    return this.currentRoundPhase === 'ROUND_RESULT' && this.roundResolution !== null;
  }

  get showDoubledHandStatus(): boolean {
    return this.hasDoubled || Boolean(this.roundResolution?.hasDoubled);
  }

  get showSurrenderStatus(): boolean {
    return Boolean(this.roundResolution?.hasSurrendered);
  }

  get showNaturalBlackjackStatus(): boolean {
    return Boolean(this.roundResolution?.hasNaturalBlackjack);
  }

  get roundResolutionTitle(): string {
    if (!this.roundResolution) {
      return '';
    }

    if (this.splitHandResults.length > 0) {
      const winCount = this.splitHandResults.filter((item) => item.outcome === 'player_win').length;
      const lossCount = this.splitHandResults.filter((item) => item.outcome === 'dealer_win' || item.outcome === 'bust').length;
      const pushCount = this.splitHandResults.filter((item) => item.outcome === 'push').length;
      return `Resultado do Split - ${winCount} vitória(s), ${lossCount} derrota(s), ${pushCount} push(es).`;
    }

    if (this.roundResolution.reason === 'dealer_bust') {
      return 'Vitoria do jogador - dealer estourou.';
    }

    if (this.roundResolution.reason === 'player_bust') {
      return 'Derrota do jogador - jogador estourou.';
    }

    if (this.roundResolution.reason === 'player_higher_total') {
      return `Vitoria do jogador - ${this.roundResolution.playerTotal} contra ${this.roundResolution.dealerTotal}.`;
    }

    if (this.roundResolution.reason === 'dealer_higher_total') {
      return `Derrota do jogador - ${this.roundResolution.playerTotal} contra ${this.roundResolution.dealerTotal}.`;
    }

    if (this.roundResolution.reason === 'push_equal_total') {
      return `Empate - ambos terminaram com ${this.roundResolution.playerTotal}.`;
    }

    if (this.roundResolution.reason === 'player_surrender') {
      return 'Surrender - rodada encerrada com perda de 0.5 unidade teorica.';
    }

    if (this.roundResolution.reason === 'player_natural_blackjack') {
      return 'Blackjack natural - vitoria do jogador.';
    }

    if (this.roundResolution.reason === 'push_natural_blackjack') {
      return 'Push - jogador e dealer tiveram blackjack natural.';
    }

    return 'Resultado da rodada encerrada.';
  }

  get roundResolutionDescription(): string {
    if (!this.roundResolution) {
      return '';
    }

    if (this.splitHandResults.length > 0) {
      return 'Resultado consolidado de maos splitadas. Confira o detalhe por mao abaixo.';
    }

    const dealerTotalLabel = this.roundResolution.dealerTotal === null ? '-' : String(this.roundResolution.dealerTotal);
    return `Jogador: ${this.roundResolution.playerCards.join(', ') || '-'} (${this.roundResolution.playerTotal}) · Dealer: ${this.roundResolution.dealerCards.join(', ') || '-'} (${dealerTotalLabel}).`;
  }

  get roundResolutionReasonDescription(): string {
    if (!this.roundResolution) {
      return '';
    }

    const notes: string[] = [this.roundResolution.message];

    if (this.roundResolution.hasDoubled) {
      notes.push('Double realizado nesta mao.');
    }

    if (this.roundResolution.hasNaturalBlackjack) {
      notes.push('Blackjack natural registrado no desfecho.');
    }

    if (this.currentRoundPreBetAnalysis) {
      notes.push(
        `Exposicao teorica definida antes da mao: ${this.currentRoundPreBetAnalysis.betting.bet_units.toFixed(2)} unidades (equivalente simulado: ${this.currentRoundPreBetAnalysis.betting.suggested_bet.toFixed(2)}).`,
      );
    }

    return notes.join(' ');
  }

  get playerNaturalBlackjackDetected(): boolean {
    if (this.isSplitRoundActive) {
      return false;
    }

    return this.isNaturalBlackjack(this.tableState.playerCards);
  }

  get dealerNaturalBlackjackDetected(): boolean {
    return this.isNaturalBlackjack(this.dealerInitialCards);
  }

  get naturalBlackjackResultTitle(): string {
    if (!this.naturalBlackjackResult) {
      return '';
    }

    return this.naturalBlackjackResult === 'push'
      ? 'Resultado: empate/push'
      : 'Resultado: vitoria do jogador';
  }

  get naturalBlackjackResultDescription(): string {
    if (!this.naturalBlackjackResult) {
      return '';
    }

    if (this.naturalBlackjackResult === 'push') {
      return 'Dealer tambem tem blackjack natural. A rodada termina em empate/push.';
    }

    return 'Dealer nao tem blackjack natural. A rodada termina com vitoria do jogador.';
  }

  get showInitialDealProgress(): boolean {
    return (
      this.currentRoundPhase === 'INITIAL_DEAL' ||
      (
        this.tableState.playerCards.length === 2 &&
        this.tableState.dealerUpcard !== null &&
        this.tableState.dealerRevealedCards.length === 0 &&
        (this.currentRoundPhase === 'PLAYER_DECISION' || this.currentRoundPhase === 'DEALER_REVEAL_PENDING')
      )
    );
  }

  get initialDealProgressLabel(): string {
    if (this.tableState.playerCards.length === 0) {
      return '1/3: primeira carta do jogador';
    }

    if (this.tableState.playerCards.length === 1) {
      return '2/3: segunda carta do jogador';
    }

    return '3/3: carta aberta do dealer';
  }

  get availableCardTargets(): CardTarget[] {
    if (this.currentRoundPhase === 'INITIAL_DEAL') {
      if (this.tableState.playerCards.length < 2) {
        return ['player'];
      }

      if (!this.tableState.dealerUpcard) {
        return ['dealer_upcard'];
      }

      return [];
    }

    const allowedTargets = getAllowedCardTargetsForRoundPhase(this.currentRoundPhase);
    return this.cardTargets.filter((target) => allowedTargets.includes(target));
  }

  get canRegisterCardsInCurrentPhase(): boolean {
    return this.availableCardTargets.includes(this.tableState.selectedTarget);
  }

  get showEnterSeenCardsSetup(): boolean {
    return (
      (this.currentRoundPhase === 'SHOE_ACTIVE' || this.currentRoundPhase === 'BETTING_DECISION') &&
      this.canUseRoundAction('START_SEEN_CARDS_SETUP')
    );
  }

  get showConfirmSeenCards(): boolean {
    return this.currentRoundPhase === 'SEEN_CARDS_SETUP' && this.canUseRoundAction('CONFIRM_SEEN_CARDS');
  }

  get showSeenCardsDefinitionCard(): boolean {
    return (
      this.currentRoundPhase === 'SHOE_ACTIVE' ||
      this.currentRoundPhase === 'SEEN_CARDS_SETUP' ||
      this.currentRoundPhase === 'BETTING_DECISION'
    );
  }

  get registerPanelTitle(): string {
    if (this.currentRoundPhase === 'SEEN_CARDS_SETUP') {
      return 'Definir cartas ja vistas';
    }

    return 'Registro de cartas';
  }

  get registerPanelDescription(): string {
    if (this.currentRoundPhase === 'SEEN_CARDS_SETUP') {
      return 'As cartas clicadas aqui entram em cartas vistas, reduzem o shoe e serao enviadas no payload da analise.';
    }

    if (this.currentRoundPhase === 'INITIAL_DEAL') {
      return this.initialDealPrompt;
    }

    return 'Registro disponivel conforme a fase atual do fluxo guiado.';
  }

  get showStartHandCard(): boolean {
    return this.currentRoundPhase === 'SHOE_ACTIVE' || this.currentRoundPhase === 'BETTING_DECISION';
  }

  get canAnalyzePreRound(): boolean {
    return this.showStartHandCard;
  }

  get preRoundAnalysisNeedsRefresh(): boolean {
    return Boolean(this.preRoundAnalysis && this.preRoundAnalysisSignature !== this.buildPreRoundAnalysisSignature());
  }

  get showConfirmBettingDecision(): boolean {
    return this.showStartHandCard && this.canUseRoundAction('CONFIRM_BET');
  }

  get initialDealPrompt(): string {
    if (this.currentRoundPhase !== 'INITIAL_DEAL') {
      return '';
    }

    if (this.tableState.playerCards.length === 0) {
      return '1/3: primeira carta do jogador';
    }

    if (this.tableState.playerCards.length === 1) {
      return '2/3: segunda carta do jogador';
    }

    if (!this.tableState.dealerUpcard) {
      return '3/3: carta aberta do dealer';
    }

    return 'Distribuicao inicial concluida.';
  }

  get currentCardRequestTitle(): string {
    if (this.currentRoundPhase === 'SEEN_CARDS_SETUP') {
      return 'Registrar cartas vistas';
    }

    if (this.currentRoundPhase === 'INITIAL_DEAL') {
      return this.initialDealProgressLabel;
    }

    if (this.currentRoundPhase === 'PLAYER_HIT_PENDING') {
      if (this.isSplitRoundActive) {
        return `${this.activeSplitHandLabel} · selecione a carta comprada pelo jogador`;
      }

      return 'Selecione a carta comprada pelo jogador';
    }

    if (this.currentRoundPhase === 'PLAYER_DOUBLE_PENDING') {
      if (this.isSplitRoundActive) {
        return `${this.activeSplitHandLabel} · selecione a única carta comprada no Double`;
      }

      return 'Selecione a única carta comprada pelo jogador no Double';
    }

    if (this.currentRoundPhase === 'DEALER_REVEAL_PENDING') {
      return 'Selecione a carta oculta/revelada do dealer';
    }

    if (this.currentRoundPhase === 'DEALER_DRAW_PENDING') {
      return 'Selecione a carta comprada pelo dealer';
    }

    return `Selecionar carta para ${this.getCardTargetLabel(this.tableState.selectedTarget)}`;
  }

  get currentCardRequestButtonLabel(): string {
    if (this.currentRoundPhase === 'SEEN_CARDS_SETUP') {
      return 'Adicionar cartas vistas';
    }

    if (this.currentRoundPhase === 'INITIAL_DEAL') {
      if (this.tableState.playerCards.length === 0) {
        return 'Selecionar primeira carta';
      }

      if (this.tableState.playerCards.length === 1) {
        return 'Selecionar segunda carta';
      }

      return 'Selecionar carta aberta';
    }

    if (this.isSplitRoundActive && this.currentRoundPhase === 'PLAYER_HIT_PENDING') {
      return `${this.activeSplitHandLabel}: selecionar carta`;
    }

    if (this.isSplitRoundActive && this.currentRoundPhase === 'PLAYER_DOUBLE_PENDING') {
      return `${this.activeSplitHandLabel}: selecionar carta do Double`;
    }

    return 'Selecionar carta';
  }

  get showDealerDrawButton(): boolean {
    return this.currentRoundPhase === 'DEALER_TURN' && this.canUseRoundAction('START_DEALER_DRAW') && this.dealerShouldDraw;
  }

  get showRoundResultButton(): boolean {
    return (
      this.currentRoundPhase === 'DEALER_TURN' &&
      this.canUseRoundAction('SHOW_ROUND_RESULT') &&
      this.dealerHandEvaluation !== null &&
      !this.dealerShouldDraw
    );
  }

  get playerActionAvailability(): PlayerActionAvailability[] {
    if (this.isSplitRoundActive) {
      return this.getSplitPlayerActionAvailability();
    }

    return getAvailablePlayerActions({
      phase: this.currentRoundPhase,
      playerCards: this.tableState.playerCards,
      rules: this.activeRules,
      flags: {
        hasHit: this.hasHit,
        hasDoubled: this.hasDoubled,
        hasSplit: this.hasSplit,
        hasSurrendered: this.hasSurrendered,
        isRoundEnded: this.isRoundEnded,
        splitCount: this.splitCount,
      },
      handEvaluation: this.playerHandEvaluation,
    });
  }

  get visiblePlayerActions(): ActionAnalysis['action'][] {
    return this.playerActionAvailability.filter((item) => item.isAvailable).map((item) => item.action);
  }

  get unavailablePlayerActionHints(): string[] {
    if (this.currentRoundPhase !== 'PLAYER_DECISION') {
      return [];
    }

    const reasons = this.playerActionAvailability
      .filter((item) => !item.isAvailable && item.reason)
      .map((item) => item.reason as string);

    return Array.from(new Set(reasons));
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

  get recommendedActionUnavailableReason(): string {
    if (!this.recommendedAction) {
      return '';
    }

    const availability = this.getPlayerActionAvailability(this.recommendedAction);
    if (!availability || availability.isAvailable) {
      return '';
    }

    return availability.reason ?? '';
  }

  canUseRoundAction(action: GuidedRoundAction): boolean {
    return isGuidedRoundActionAllowed(this.currentRoundPhase, action);
  }

  get isSeenCardsContinuousModal(): boolean {
    return this.currentRoundPhase === 'SEEN_CARDS_SETUP' && this.tableState.selectedTarget === 'seen';
  }

  get seenCardsModalHelperText(): string {
    return this.isSeenCardsContinuousModal
      ? 'Selecione quantas cartas quiser. Clique em Concluir quando terminar.'
      : '';
  }

  get canUndoLastSeenCardInModal(): boolean {
    const lastEntry = this.tableState.history[this.tableState.history.length - 1];
    return this.isSeenCardsContinuousModal && lastEntry?.target === 'seen';
  }

  enterSeenCardsSetup(): void {
    if (!this.canUseRoundAction('START_SEEN_CARDS_SETUP')) {
      this.actionGuidance = 'Acao indisponivel na fase atual da rodada.';
      return;
    }

    this.advanceRoundPhase('START_SEEN_CARDS_SETUP');
    this.selectTarget('seen');
    this.actionGuidance = 'Use esta etapa para informar cartas que ja sairam neste shoe antes da rodada atual.';
    this.openCardSelectionModal('Registrar cartas vistas');
  }

  confirmSeenCardsSetup(): void {
    if (!this.advanceRoundPhase('CONFIRM_SEEN_CARDS')) {
      return;
    }

    this.actionGuidance = 'Cartas vistas confirmadas. Confirme a mao para iniciar a distribuicao das cartas.';
  }

  confirmBettingDecision(): void {
    const hasPreRoundAnalysis = Boolean(this.preRoundAnalysis);
    const isPreRoundAnalysisStale = this.preRoundAnalysisNeedsRefresh;

    if (isPreRoundAnalysisStale) {
      const continueWithStaleAnalysis = window.confirm(
        'A análise pré-rodada está desatualizada. Deseja iniciar a mão mesmo assim?',
      );

      if (!continueWithStaleAnalysis) {
        this.actionGuidance = 'Inicio da mao cancelado. Atualize a analise pre-rodada antes de iniciar.';
        return;
      }
    }

    this.currentRoundPreBetAnalysis = this.preRoundAnalysis
      ? this.clonePreRoundAnalysis(this.preRoundAnalysis)
      : null;

    if (!this.advanceRoundPhase('CONFIRM_BET')) {
      return;
    }

    this.selectTarget('player');
    const preRoundWarning = isPreRoundAnalysisStale
      ? 'A analise pre-rodada estava desatualizada e foi mantida sem recalculo automatico. '
      : hasPreRoundAnalysis
        ? ''
        : 'Voce ainda nao executou a analise pre-rodada. ';
    this.actionGuidance = `${preRoundWarning}${this.initialDealPrompt}`;
    this.openCardSelectionModal(this.currentCardRequestTitle);
  }

  analyzePreRound(): void {
    const preRoundAnalysis = this.executePreRoundAnalysis(false);

    if (!preRoundAnalysis) {
      this.actionGuidance = 'Analise pre-rodada disponivel somente antes do inicio da mao.';
      return;
    }

    this.actionGuidance =
      'Analise pre-rodada atualizada. Revise status do shoe e exposicao teorica antes de aceitar a aposta simulacional.';
  }

  startDealerDraw(): void {
    if (!this.advanceRoundPhase('START_DEALER_DRAW')) {
      return;
    }

    this.selectTarget('dealer_revealed');
    this.actionGuidance = 'Dealer com total abaixo do limite deve comprar carta.';
    this.openCardSelectionModal('Selecione a carta comprada pelo dealer');
  }

  showRoundResult(): void {
    if (this.currentRoundPhase !== 'DEALER_TURN') {
      this.actionGuidance = 'Resultado indisponivel fora do turno do dealer.';
      return;
    }

    this.finalizeRoundAgainstDealerTotals();
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
      roundPhase: transitionGuidedRoundPhase(initializedState.roundPhase, 'START_SHOE'),
    };
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.latestBettingData = null;
    this.actionGuidance = 'Shoe iniciado. Defina cartas ja vistas se necessario, ou va direto para o inicio da rodada.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.hasDoubled = false;
    this.playerCardsLocked = false;
    this.hasSurrendered = false;
    this.splitCount = 0;
    this.shoeNumber = 1;
    this.recentRegisteredCardValue = null;
    this.naturalBlackjackResult = null;
    this.roundResolution = null;
    this.clearSplitRoundState();
    this.preRoundAnalysis = null;
    this.currentRoundPreBetAnalysis = null;
    this.preRoundAnalysisSignature = '';
    this.closeCardSelectionModal();
  }

  continueFromAwareness(): void {
    if (!this.awarenessConfirmationChecked) {
      return;
    }

    this.showAwarenessScreen = false;
  }

  selectTarget(target: CardTarget): void {
    if (!this.availableCardTargets.includes(target)) {
      this.cardRegistrationError = 'Destino indisponivel na fase atual da rodada.';
      this.cardRegistrationFeedback = '';
      return;
    }

    this.tableState = {
      ...this.tableState,
      selectedTarget: target,
    };
  }

  openCardSelectionModal(title = this.currentCardRequestTitle): void {
    if (this.availableCardTargets.length === 0) {
      this.cardRegistrationError = 'Nenhuma carta pode ser registrada na fase atual da rodada.';
      this.cardRegistrationFeedback = '';
      return;
    }

    if (!this.availableCardTargets.includes(this.tableState.selectedTarget)) {
      const [nextTarget] = this.availableCardTargets;
      this.tableState = {
        ...this.tableState,
        selectedTarget: nextTarget,
      };
    }

    if (!this.canRegisterCardsInCurrentPhase) {
      this.cardRegistrationError = 'Destino indisponivel na fase atual da rodada.';
      this.cardRegistrationFeedback = '';
      return;
    }

    this.cardRegistrationError = '';
    this.cardModalTitle = title;
    this.cardModalOpen = true;
  }

  closeCardSelectionModal(): void {
    this.cardModalOpen = false;
  }

  handleModalCardSelected(value: CardValue): void {
    if (this.isSeenCardsContinuousModal) {
      this.registerCard(value);
      return;
    }

    const previousTitle = this.cardModalTitle;
    this.closeCardSelectionModal();

    if (!this.registerCard(value)) {
      this.cardModalTitle = previousTitle;
      this.cardModalOpen = true;
    }
  }

  undoLastSeenCardFromModal(): void {
    if (!this.canUndoLastSeenCardInModal) {
      this.cardRegistrationError = 'Nao ha carta vista para desfazer neste modal.';
      this.cardRegistrationFeedback = '';
      return;
    }

    this.undoLastCard();
  }

  registerCard(value: CardValue): boolean {
    const registrationAction = this.getRegistrationActionForCurrentTarget();

    if (!registrationAction) {
      this.cardRegistrationError = 'Registro de carta indisponivel na fase atual da rodada.';
      this.cardRegistrationFeedback = '';
      return false;
    }

    if (this.tableState.selectedTarget === 'player' && this.playerCardsLocked) {
      this.cardRegistrationError = 'Mão do jogador bloqueada após Dobrar. Continue registrando as cartas do dealer.';
      this.cardRegistrationFeedback = '';
      return false;
    }

    const result = registerCardAction(this.tableState, value, this.tableState.selectedTarget);
    this.tableState = result.state;
    this.cardRegistrationError = result.ok ? '' : result.error ?? 'Falha ao registrar carta.';
    this.cardRegistrationFeedback = result.ok
      ? `${this.getCardPrimaryDisplay(value)} registrada em ${this.getCardTargetLabel(this.tableState.selectedTarget)}.`
      : '';
    this.recentRegisteredCardValue = result.ok ? value : null;
    this.analysisError = '';
    this.analysisResponse = result.ok ? null : this.analysisResponse;

    if (result.ok) {
      this.applyPostRegistrationTransition(registrationAction);
    }

    return result.ok;
  }

  undoLastCard(): void {
    if (this.isSplitRoundActive) {
      this.cardRegistrationError = 'Desfazer carta durante Split ainda nao e suportado nesta etapa.';
      this.cardRegistrationFeedback = '';
      return;
    }

    if (!this.canUseRoundAction('UNDO_CARD')) {
      this.cardRegistrationError = 'Desfazer carta indisponivel na fase atual da rodada.';
      this.cardRegistrationFeedback = '';
      return;
    }

    const result = undoLastRegisteredCard(this.tableState);
    this.tableState = result.state;
    this.cardRegistrationError = result.ok ? '' : result.error ?? 'Falha ao desfazer carta.';
    this.cardRegistrationFeedback = result.ok ? 'Última carta desfeita.' : '';
    this.recentRegisteredCardValue = null;
    this.analysisError = '';
  }

  resetCurrentRound(): void {
    const stateForReset = this.getStateWithAllSplitPlayerCards();

    this.tableState = {
      ...resetRound(stateForReset),
      gamePhase: 'shoe_active',
      roundPhase: 'SHOE_ACTIVE',
    };
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Rodada reiniciada. Registre novamente as cartas da rodada atual.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.hasDoubled = false;
    this.playerCardsLocked = false;
    this.hasSurrendered = false;
    this.splitCount = 0;
    this.recentRegisteredCardValue = null;
    this.naturalBlackjackResult = null;
    this.roundResolution = null;
    this.clearSplitRoundState();
    this.preRoundAnalysis = null;
    this.currentRoundPreBetAnalysis = null;
    this.preRoundAnalysisSignature = '';
    this.closeCardSelectionModal();
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
      roundPhase: 'SHOE_ACTIVE',
    };
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.latestBettingData = null;
    this.actionGuidance = 'Shoe reiniciado com as contagens iniciais.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.hasDoubled = false;
    this.playerCardsLocked = false;
    this.hasSurrendered = false;
    this.splitCount = 0;
    this.shoeNumber += 1;
    this.recentRegisteredCardValue = null;
    this.naturalBlackjackResult = null;
    this.roundResolution = null;
    this.clearSplitRoundState();
    this.preRoundAnalysis = null;
    this.currentRoundPreBetAnalysis = null;
    this.preRoundAnalysisSignature = '';
    this.closeCardSelectionModal();
  }

  startNextRound(): void {
    const stateForNextRound = this.getStateWithAllSplitPlayerCards();

    this.tableState = {
      ...startNewRoundKeepingShoe(stateForNextRound),
      roundPhase: 'SHOE_ACTIVE',
    };
    this.cardRegistrationError = '';
    this.cardRegistrationFeedback = '';
    this.analysisError = '';
    this.analysisResponse = null;
    this.actionGuidance = 'Nova rodada iniciada mantendo o shoe atual.';
    this.visualRoundPhase = 'shoe_active';
    this.doubleCardPending = false;
    this.hasDoubled = false;
    this.playerCardsLocked = false;
    this.hasSurrendered = false;
    this.splitCount = 0;
    this.recentRegisteredCardValue = null;
    this.naturalBlackjackResult = null;
    this.roundResolution = null;
    this.clearSplitRoundState();
    this.preRoundAnalysis = null;
    this.currentRoundPreBetAnalysis = null;
    this.preRoundAnalysisSignature = '';
    this.closeCardSelectionModal();
  }

  onHit(): void {
    if (!this.canExecutePlayerAction('hit')) {
      this.showUnavailableActionGuidance('hit');
      return;
    }

    this.advanceRoundPhase('HIT');
    this.selectTarget('player');
    if (this.isSplitRoundActive) {
      this.markActiveSplitHandAwaitingCard();
      this.actionGuidance = `${this.activeSplitHandLabel}: pedir carta selecionado. Registre a carta comprada para esta mao.`;
      this.openCardSelectionModal(`${this.activeSplitHandLabel} · selecione a carta comprada`);
      return;
    }

    this.actionGuidance = 'Pedir carta selecionado. Registre a carta comprada na mao do jogador.';
    this.openCardSelectionModal('Selecione a carta comprada pelo jogador');
  }

  onStand(): void {
    if (!this.canExecutePlayerAction('stand')) {
      this.showUnavailableActionGuidance('stand');
      return;
    }

    if (this.isSplitRoundActive) {
      this.markActiveSplitHandAs('stood');
      this.actionGuidance = `${this.activeSplitHandLabel} finalizada em Stand.`;
      this.advanceSplitRoundAfterCurrentHandResolution();
      return;
    }

    this.advanceRoundPhase('STAND');
    this.selectTarget('dealer_revealed');
    this.actionGuidance = 'A vez do jogador terminou. Agora revele a carta oculta do dealer.';
    this.openCardSelectionModal('Selecione a carta oculta/revelada do dealer');
  }

  onDouble(): void {
    if (!this.canExecutePlayerAction('double')) {
      this.showUnavailableActionGuidance('double');
      return;
    }

    if (this.isSplitRoundActive) {
      this.advanceRoundPhase('DOUBLE');
      this.selectTarget('player');
      this.doubleCardPending = true;
      this.actionGuidance = `${this.activeSplitHandLabel}: Dobrar selecionado. Registre a unica carta adicional desta mao.`;
      this.openCardSelectionModal(`${this.activeSplitHandLabel} · selecione a carta do Double`);
      return;
    }

    this.advanceRoundPhase('DOUBLE');
    this.selectTarget('player');
    this.doubleCardPending = true;
    this.actionGuidance =
      'Dobrar selecionado. Registre agora a unica carta adicional do jogador; depois disso a mao sera bloqueada.';
    this.openCardSelectionModal('Selecione a única carta comprada pelo jogador no Double');
  }

  onSplit(): void {
    if (!this.canExecutePlayerAction('split')) {
      this.showUnavailableActionGuidance('split');
      return;
    }

    if (this.tableState.playerCards.length !== 2 || this.tableState.playerCards[0] !== this.tableState.playerCards[1]) {
      this.actionGuidance = 'Split requer exatamente duas cartas iguais na mao atual.';
      return;
    }

    const [firstCard, secondCard] = this.tableState.playerCards;

    this.splitCount += 1;
    this.splitHands = [
      {
        cards: [firstCard],
        status: 'awaiting_card',
        hasDoubled: false,
      },
      {
        cards: [secondCard],
        status: 'pending',
        hasDoubled: false,
      },
    ];
    this.activeSplitHandIndex = 0;
    this.splitHandResults = [];
    this.isSplitAcesRound = firstCard === 'A' && secondCard === 'A';
    this.analysisResponse = null;
    this.analysisError = '';
    this.roundResolution = null;
    this.tableState = {
      ...this.tableState,
      playerCards: [firstCard],
      selectedTarget: 'player',
    };
    this.setRoundPhase('PLAYER_HIT_PENDING');
    this.actionGuidance = this.isSplitAcesRound
      ? 'Split de ases aplicado. Cada mao recebera uma carta e sera encerrada automaticamente nesta etapa.'
      : 'Split aplicado. Mão 1 ativa: registre a proxima carta para esta mao.';
    this.openCardSelectionModal('Mão 1 · selecione a próxima carta');
  }

  onSurrender(): void {
    if (!this.canExecutePlayerAction('surrender')) {
      this.showUnavailableActionGuidance('surrender');
      return;
    }

    const confirmed = window.confirm('Deseja realmente render-se nesta mão?');
    if (!confirmed) {
      this.actionGuidance = 'Render-se cancelado. A rodada continua na decisao do jogador.';
      return;
    }

    if (!this.advanceRoundPhase('SURRENDER')) {
      return;
    }

    this.hasSurrendered = true;
    this.roundResolution = {
      outcome: 'dealer_win',
      reason: 'player_surrender',
      playerTotal: this.playerHandEvaluation.total,
      dealerTotal: null,
      playerCards: [...this.tableState.playerCards],
      dealerCards: [...this.dealerCards],
      hasDoubled: this.hasDoubled,
      hasSurrendered: true,
      hasNaturalBlackjack: false,
      isPlayerBust: false,
      isDealerBust: false,
      isPush: false,
      message: 'Jogador se rendeu. Rodada encerrada com perda de 0.5 unidade teorica.',
    };
    this.visualRoundPhase = 'round_finished';
    this.doubleCardPending = false;
    this.hasDoubled = false;
    this.playerCardsLocked = true;
    this.actionGuidance = 'Jogador se rendeu. Rodada encerrada.';
  }

  analyzeCurrentDecision(): void {
    if (this.isSplitRoundActive) {
      this.analysisError = 'Análise de decisão para mãos splitadas será refinada em etapa futura.';
      return;
    }

    if (!this.canUseRoundAction('ANALYZE_DECISION')) {
      this.analysisError = 'Analise indisponivel na fase atual da rodada.';
      return;
    }

    if (this.tableState.playerCards.length < 2) {
      this.analysisError = 'Análise indisponível: registre pelo menos 2 cartas do jogador.';
      return;
    }

    if (!this.tableState.dealerUpcard) {
      this.analysisError = 'Análise indisponível: defina a carta aberta do dealer antes de analisar.';
      return;
    }

    const payload = buildAnalyzeHandRequest(this.tableState, {
      rules: this.activeRules,
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
          this.latestBettingData = response.betting ?? this.latestBettingData;
          this.setRoundPhase(transitionGuidedRoundPhase(this.currentRoundPhase, 'ANALYZE_DECISION'));
          this.actionGuidance = 'Analise concluida. Escolha uma das acoes disponiveis para o estado atual.';
        },
        error: (error: unknown) => {
          this.analysisResponse = null;
          this.analysisError = this.resolveAnalysisErrorMessage(error);
          console.error('Erro ao processar analise da API:', error);
        },
      });
  }

  onPlayerAction(action: ActionAnalysis['action']): void {
    if (action === 'hit') {
      this.onHit();
      return;
    }

    if (action === 'stand') {
      this.onStand();
      return;
    }

    if (action === 'double') {
      this.onDouble();
      return;
    }

    if (action === 'split') {
      this.onSplit();
      return;
    }

    this.onSurrender();
  }

  canExecutePlayerAction(action: ActionAnalysis['action']): boolean {
    return Boolean(this.getPlayerActionAvailability(action)?.isAvailable);
  }

  isRecommendedExecutableAction(action: ActionAnalysis['action']): boolean {
    return this.recommendedAction === action && this.canExecutePlayerAction(action);
  }

  private get activeRules(): GameRulesRequest {
    return this.savedRules ?? {
      number_of_decks: this.config.number_of_decks,
      dealer_hits_soft_17: this.config.dealer_hits_soft_17,
      blackjack_payout: this.config.blackjack_payout,
      double_allowed: this.config.double_allowed,
      double_after_split: this.config.double_after_split,
      surrender_allowed: this.config.surrender_allowed,
      max_splits: this.config.max_splits,
      dealer_peek: this.config.dealer_peek,
    };
  }

  private get hasHit(): boolean {
    return this.tableState.playerCards.length > 2 && !this.hasDoubled;
  }

  private get hasSplit(): boolean {
    return this.isSplitRoundActive || this.splitCount > 0;
  }

  private get isRoundEnded(): boolean {
    return this.currentRoundPhase === 'ROUND_RESULT' || this.currentRoundPhase === 'ROUND_ENDED';
  }

  private get dealerInitialCards(): CardValue[] {
    if (!this.tableState.dealerUpcard || this.tableState.dealerRevealedCards.length === 0) {
      return [];
    }

    return [this.tableState.dealerUpcard, this.tableState.dealerRevealedCards[0]];
  }

  private get dealerCards(): CardValue[] {
    if (!this.tableState.dealerUpcard) {
      return [];
    }

    return [this.tableState.dealerUpcard, ...this.tableState.dealerRevealedCards];
  }

  private isNaturalBlackjack(cards: CardValue[]): boolean {
    return cards.length === 2 && cards.includes('A') && cards.includes('10');
  }

  private resolveNaturalBlackjackRound(): void {
    this.naturalBlackjackResult = this.dealerNaturalBlackjackDetected ? 'push' : 'player_win';
    const dealerEvaluation = this.dealerHandEvaluation;
    const playerEvaluation = this.playerHandEvaluation;
    this.roundResolution = {
      outcome: this.naturalBlackjackResult,
      reason: this.naturalBlackjackResult === 'push' ? 'push_natural_blackjack' : 'player_natural_blackjack',
      playerTotal: playerEvaluation.total,
      dealerTotal: dealerEvaluation?.total ?? null,
      playerCards: [...this.tableState.playerCards],
      dealerCards: [...this.dealerCards],
      hasDoubled: this.hasDoubled,
      hasSurrendered: false,
      hasNaturalBlackjack: true,
      isPlayerBust: false,
      isDealerBust: false,
      isPush: this.naturalBlackjackResult === 'push',
      message:
        this.naturalBlackjackResult === 'push'
          ? 'Push por blackjack natural em ambas as maos.'
          : 'Blackjack natural do jogador com vitoria na rodada.',
    };
    this.setRoundPhase('ROUND_RESULT');
    this.visualRoundPhase = 'round_finished';
    this.playerCardsLocked = true;
    this.doubleCardPending = false;
    this.actionGuidance =
      this.naturalBlackjackResult === 'push'
        ? 'Blackjack natural detectado. Dealer tambem tem blackjack natural: empate/push.'
        : 'Blackjack natural detectado. Dealer nao tem blackjack natural: vitoria do jogador.';
  }

  private getPlayerActionAvailability(action: ActionAnalysis['action']): PlayerActionAvailability | undefined {
    return this.playerActionAvailability.find((item) => item.action === action);
  }

  private getPlayerActionUnavailableReason(action: ActionAnalysis['action']): string {
    return this.getPlayerActionAvailability(action)?.reason ?? 'Acao indisponivel na fase atual da rodada.';
  }

  private showUnavailableActionGuidance(action: ActionAnalysis['action']): void {
    this.actionGuidance = this.getPlayerActionUnavailableReason(action);
  }

  private setRoundPhase(roundPhase: GuidedRoundPhase): void {
    this.tableState = {
      ...this.tableState,
      roundPhase,
    };
    this.visualRoundPhase = this.resolveLegacyVisualRoundPhase(roundPhase);
  }

  private advanceRoundPhase(action: GuidedRoundAction): boolean {
    if (!this.canUseRoundAction(action)) {
      this.actionGuidance = 'Acao indisponivel na fase atual da rodada.';
      return false;
    }

    this.setRoundPhase(transitionGuidedRoundPhase(this.currentRoundPhase, action));
    return true;
  }

  private resolveLegacyVisualRoundPhase(roundPhase: GuidedRoundPhase): VisualRoundPhase {
    if (roundPhase === 'DEALER_REVEAL_PENDING' || roundPhase === 'DEALER_TURN' || roundPhase === 'DEALER_DRAW_PENDING') {
      return 'dealer_reveal';
    }

    if (roundPhase === 'ROUND_RESULT' || roundPhase === 'ROUND_ENDED') {
      return 'round_finished';
    }

    return 'shoe_active';
  }

  private getRegistrationActionForCurrentTarget(): GuidedRoundAction | null {
    const target = this.tableState.selectedTarget;

    if (!this.availableCardTargets.includes(target)) {
      return null;
    }

    if (this.currentRoundPhase === 'SEEN_CARDS_SETUP') {
      return target === 'seen' ? 'REGISTER_SEEN_CARD' : null;
    }

    if (this.currentRoundPhase === 'INITIAL_DEAL') {
      return 'REGISTER_INITIAL_CARD';
    }

    if (this.currentRoundPhase === 'PLAYER_HIT_PENDING' && target === 'player') {
      return 'REGISTER_PLAYER_HIT';
    }

    if (this.currentRoundPhase === 'PLAYER_DOUBLE_PENDING' && target === 'player') {
      return 'REGISTER_PLAYER_DOUBLE';
    }

    if (this.currentRoundPhase === 'DEALER_REVEAL_PENDING' && target === 'dealer_revealed') {
      return 'REVEAL_DEALER_CARD';
    }

    if (this.currentRoundPhase === 'DEALER_DRAW_PENDING' && target === 'dealer_revealed') {
      return 'REGISTER_DEALER_DRAW';
    }

    return null;
  }

  private applyPostRegistrationTransition(action: GuidedRoundAction): void {
    if (action === 'REGISTER_PLAYER_HIT') {
      if (this.isSplitRoundActive) {
        const activeHand = this.activeSplitHand;

        if (!activeHand) {
          this.cardRegistrationError = 'Nenhuma mão splitada ativa para registrar carta.';
          this.cardRegistrationFeedback = '';
          return;
        }

        this.updateActiveSplitHandCards(this.tableState.playerCards);
        const handEvaluation = this.playerHandEvaluation;

        if (handEvaluation.isBust) {
          this.markActiveSplitHandAs('bust');
          this.analysisResponse = null;
          this.analysisError = '';
          this.actionGuidance = `${this.activeSplitHandLabel} estourou com ${handEvaluation.total} pontos.`;
          this.advanceSplitRoundAfterCurrentHandResolution();
          return;
        }

        if (this.isSplitAcesRound) {
          this.markActiveSplitHandAs('stood');
          this.actionGuidance = `${this.activeSplitHandLabel} recebeu uma carta e foi encerrada automaticamente (Split de ases).`;
          this.advanceSplitRoundAfterCurrentHandResolution();
          return;
        }

        this.markActiveSplitHandAs('active');
        this.setRoundPhase('PLAYER_DECISION');
        this.analysisResponse = null;
        this.analysisError = '';
        this.actionGuidance = `${this.activeSplitHandLabel} atualizada. Escolha Hit, Stand ou Double conforme as regras.`;
        return;
      }

      const handEvaluation = this.playerHandEvaluation;

      if (handEvaluation.isBust) {
        this.roundResolution = {
          outcome: 'dealer_win',
          reason: 'player_bust',
          playerTotal: handEvaluation.total,
          dealerTotal: this.dealerHandEvaluation?.total ?? null,
          playerCards: [...this.tableState.playerCards],
          dealerCards: [...this.dealerCards],
          hasDoubled: this.hasDoubled,
          hasSurrendered: false,
          hasNaturalBlackjack: false,
          isPlayerBust: true,
          isDealerBust: false,
          isPush: false,
          message: 'Jogador estourou acima de 21 pontos.',
        };
        this.setRoundPhase('ROUND_RESULT');
        this.visualRoundPhase = 'round_finished';
        this.playerCardsLocked = true;
        this.doubleCardPending = false;
        this.analysisResponse = null;
        this.analysisError = '';
        this.actionGuidance = 'Jogador estourou. Rodada encerrada.';
        return;
      }

      this.setRoundPhase(transitionGuidedRoundPhase(this.currentRoundPhase, action));
      this.actionGuidance = 'Carta do jogador registrada. Atualizando analise para a nova mao do jogador.';

      if (this.tableState.dealerUpcard) {
        this.analyzeCurrentDecision();
      }

      return;
    }

    if (action === 'REVEAL_DEALER_CARD' && this.playerNaturalBlackjackDetected) {
      this.resolveNaturalBlackjackRound();
      return;
    }

    if (action === 'REGISTER_PLAYER_DOUBLE') {
      if (this.isSplitRoundActive) {
        this.doubleCardPending = false;
        this.updateActiveSplitHandCards(this.tableState.playerCards);
        const handEvaluation = this.playerHandEvaluation;

        if (handEvaluation.isBust) {
          this.markActiveSplitHandAs('bust', true);
          this.hasDoubled = true;
          this.analysisResponse = null;
          this.analysisError = '';
          this.actionGuidance = `${this.activeSplitHandLabel} estourou após Double com ${handEvaluation.total} pontos.`;
          this.advanceSplitRoundAfterCurrentHandResolution();
          return;
        }

        this.markActiveSplitHandAs('doubled', true);
        this.hasDoubled = true;
        this.analysisResponse = null;
        this.analysisError = '';
        this.actionGuidance = `${this.activeSplitHandLabel} encerrada após Double.`;
        this.advanceSplitRoundAfterCurrentHandResolution();
        return;
      }

      const handEvaluation = this.playerHandEvaluation;

      this.doubleCardPending = false;
      this.hasDoubled = true;
      this.playerCardsLocked = true;

      if (handEvaluation.isBust) {
        this.roundResolution = {
          outcome: 'dealer_win',
          reason: 'player_bust',
          playerTotal: handEvaluation.total,
          dealerTotal: this.dealerHandEvaluation?.total ?? null,
          playerCards: [...this.tableState.playerCards],
          dealerCards: [...this.dealerCards],
          hasDoubled: true,
          hasSurrendered: false,
          hasNaturalBlackjack: false,
          isPlayerBust: true,
          isDealerBust: false,
          isPush: false,
          message: 'Jogador estourou acima de 21 pontos apos o Double.',
        };
        this.setRoundPhase('ROUND_RESULT');
        this.visualRoundPhase = 'round_finished';
        this.analysisResponse = null;
        this.analysisError = '';
        this.actionGuidance = 'Jogador estourou apos Double. Rodada encerrada.';
        return;
      }

      this.setRoundPhase(transitionGuidedRoundPhase(this.currentRoundPhase, action));
      this.tableState = {
        ...this.tableState,
        selectedTarget: 'dealer_revealed',
      };
      this.actionGuidance =
        'Carta unica do Dobrar registrada. A mao do jogador foi bloqueada; revele a carta oculta do dealer.';
      this.openCardSelectionModal('Selecione a carta oculta/revelada do dealer');
      return;
    }

    if (action === 'REVEAL_DEALER_CARD' || action === 'REGISTER_DEALER_DRAW') {
      this.resolveDealerFlowAfterRegisteredCard(action);
      return;
    }

    if (
      action === 'REGISTER_INITIAL_CARD' &&
      this.currentRoundPhase === 'INITIAL_DEAL'
    ) {
      if (this.tableState.playerCards.length < 2) {
        this.tableState = {
          ...this.tableState,
          selectedTarget: 'player',
        };
      } else if (!this.tableState.dealerUpcard) {
        this.tableState = {
          ...this.tableState,
          selectedTarget: 'dealer_upcard',
        };
      } else if (this.playerNaturalBlackjackDetected) {
        this.setRoundPhase('DEALER_REVEAL_PENDING');
        this.tableState = {
          ...this.tableState,
          selectedTarget: 'dealer_revealed',
        };
        this.actionGuidance =
          'Blackjack natural do jogador identificado. Revele a carta oculta do dealer para fechar o resultado da rodada.';
        this.openCardSelectionModal('Selecione a carta oculta/revelada do dealer');
        return;
      } else {
        this.setRoundPhase('PLAYER_DECISION');
        this.actionGuidance =
          'Distribuicao inicial concluida. Use Analisar decisao atual para chamar a engine e exibir as acoes possiveis.';
        return;
      }

      this.actionGuidance = this.initialDealPrompt;
    }
  }

  private resolveDealerFlowAfterRegisteredCard(action: GuidedRoundAction): void {
    const dealerEvaluation = this.dealerHandEvaluation;

    if (!dealerEvaluation) {
      this.setRoundPhase(transitionGuidedRoundPhase(this.currentRoundPhase, action));
      this.actionGuidance = 'Carta do dealer registrada. Continue o fluxo do dealer.';
      return;
    }

    if (this.dealerShouldDraw) {
      this.setRoundPhase('DEALER_TURN');
      this.actionGuidance =
        dealerEvaluation.total === 17 && dealerEvaluation.isSoft && this.activeRules.dealer_hits_soft_17
          ? 'Dealer com soft 17 e regra ativa para compra. Clique em Dealer compra carta.'
          : `Dealer com ${dealerEvaluation.total} pontos. Clique em Dealer compra carta.`;
      return;
    }

    this.finalizeRoundAgainstDealerTotals();
  }

  private finalizeRoundAgainstDealerTotals(): void {
    if (this.isSplitRoundActive) {
      this.finalizeSplitRoundAgainstDealerTotals();
      return;
    }

    const playerEvaluation = this.playerHandEvaluation;
    const dealerEvaluation = this.dealerHandEvaluation;

    if (!dealerEvaluation) {
      this.roundResolution = {
        outcome: 'push',
        reason: 'push_equal_total',
        playerTotal: playerEvaluation.total,
        dealerTotal: null,
        playerCards: [...this.tableState.playerCards],
        dealerCards: [...this.dealerCards],
        hasDoubled: this.hasDoubled,
        hasSurrendered: false,
        hasNaturalBlackjack: false,
        isPlayerBust: playerEvaluation.isBust,
        isDealerBust: false,
        isPush: true,
        message: 'Nao foi possivel calcular o total final do dealer nesta rodada.',
      };
      this.setRoundPhase('ROUND_RESULT');
      this.visualRoundPhase = 'round_finished';
      this.actionGuidance = 'Resultado da rodada encerrado sem total final completo do dealer.';
      return;
    }

    let outcome: RoundOutcome;
    let reason: RoundResultReason;
    let guidanceMessage: string;
    let resultMessage: string;

    if (dealerEvaluation.isBust) {
      outcome = 'player_win';
      reason = 'dealer_bust';
      guidanceMessage = 'Dealer estourou. Rodada encerrada com vitoria do jogador.';
      resultMessage = 'Dealer estourou acima de 21 pontos.';
    } else if (playerEvaluation.total > dealerEvaluation.total) {
      outcome = 'player_win';
      reason = 'player_higher_total';
      guidanceMessage = 'Jogador venceu por total superior ao dealer.';
      resultMessage = `Jogador venceu no total: ${playerEvaluation.total} contra ${dealerEvaluation.total}.`;
    } else if (playerEvaluation.total < dealerEvaluation.total) {
      outcome = 'dealer_win';
      reason = 'dealer_higher_total';
      guidanceMessage = 'Dealer venceu por total superior ao jogador.';
      resultMessage = `Dealer venceu no total: ${dealerEvaluation.total} contra ${playerEvaluation.total}.`;
    } else {
      outcome = 'push';
      reason = 'push_equal_total';
      guidanceMessage = 'Totais iguais. Rodada encerrada em empate/push.';
      resultMessage = `Empate em ${playerEvaluation.total} pontos para ambos.`;
    }

    this.roundResolution = {
      outcome,
      reason,
      playerTotal: playerEvaluation.total,
      dealerTotal: dealerEvaluation.total,
      playerCards: [...this.tableState.playerCards],
      dealerCards: [...this.dealerCards],
      hasDoubled: this.hasDoubled,
      hasSurrendered: false,
      hasNaturalBlackjack: false,
      isPlayerBust: false,
      isDealerBust: dealerEvaluation.isBust,
      isPush: outcome === 'push',
      message: resultMessage,
    };

    this.setRoundPhase('ROUND_RESULT');
    this.visualRoundPhase = 'round_finished';
    this.playerCardsLocked = true;
    this.doubleCardPending = false;
    this.actionGuidance = guidanceMessage;
  }

  private getSplitPlayerActionAvailability(): PlayerActionAvailability[] {
    const unavailableForPhase: PlayerActionAvailability[] = [
      {
        action: 'hit',
        isAvailable: false,
        reason: 'Acoes do jogador so ficam disponiveis na fase de decisao.',
      },
      {
        action: 'stand',
        isAvailable: false,
        reason: 'Acoes do jogador so ficam disponiveis na fase de decisao.',
      },
      {
        action: 'double',
        isAvailable: false,
        reason: 'Acoes do jogador so ficam disponiveis na fase de decisao.',
      },
      {
        action: 'split',
        isAvailable: false,
        reason: 'Resplit nao implementado nesta etapa.',
      },
      {
        action: 'surrender',
        isAvailable: false,
        reason: 'Surrender nao fica disponivel apos Split.',
      },
    ];

    if (this.currentRoundPhase !== 'PLAYER_DECISION') {
      return unavailableForPhase;
    }

    const activeHand = this.activeSplitHand;

    if (!activeHand) {
      return unavailableForPhase.map((item) => ({
        ...item,
        reason: 'Nenhuma mao splitada ativa no momento.',
      }));
    }

    const handEvaluation = evaluatePlayerHand(activeHand.cards);
    if (handEvaluation.isBust || activeHand.status === 'bust') {
      return unavailableForPhase.map((item) => ({
        ...item,
        reason: 'Mao ativa estourada e ja encerrada.',
      }));
    }

    const canDoubleAfterSplit =
      Boolean(this.activeRules.double_allowed) &&
      Boolean(this.activeRules.double_after_split) &&
      activeHand.cards.length === 2 &&
      !activeHand.hasDoubled;

    return [
      {
        action: 'hit',
        isAvailable: true,
      },
      {
        action: 'stand',
        isAvailable: true,
      },
      {
        action: 'double',
        isAvailable: canDoubleAfterSplit,
        reason: canDoubleAfterSplit
          ? undefined
          : !this.activeRules.double_allowed
            ? 'Regra da mesa: Dobrar desativado.'
            : !this.activeRules.double_after_split
              ? 'Double apos Split desativado para esta mesa.'
              : 'Double apos Split so fica disponivel com 2 cartas na mao ativa.',
      },
      {
        action: 'split',
        isAvailable: false,
        reason: 'Resplit nao implementado nesta etapa.',
      },
      {
        action: 'surrender',
        isAvailable: false,
        reason: 'Surrender nao fica disponivel apos Split.',
      },
    ];
  }

  private getSplitHandStatusLabel(hand: SplitHandState, handIndex: number): string {
    if (hand.status === 'pending') {
      return 'Aguardando ativacao';
    }

    if (hand.status === 'awaiting_card') {
      return handIndex === this.activeSplitHandIndex ? 'Aguardando carta' : 'Aguardando';
    }

    if (hand.status === 'active') {
      return 'Em decisao';
    }

    if (hand.status === 'stood') {
      return 'Parada';
    }

    if (hand.status === 'bust') {
      return 'Bust';
    }

    if (hand.status === 'doubled') {
      return 'Encerrada com Double';
    }

    return 'Concluida';
  }

  getSplitHandOutcomeLabel(result: SplitHandDisplay): string {
    if (result.outcome === null) {
      return result.reason;
    }

    if (result.outcome === 'bust') {
      return 'Bust';
    }

    if (result.outcome === 'player_win') {
      return 'Vitoria';
    }

    if (result.outcome === 'dealer_win') {
      return 'Derrota';
    }

    return 'Push';
  }

  getSplitHandOutcomeClass(result: SplitHandDisplay): string {
    if (result.outcome === 'player_win') {
      return 'split-outcome-win';
    }

    if (result.outcome === 'dealer_win' || result.outcome === 'bust') {
      return 'split-outcome-loss';
    }

    if (result.outcome === 'push') {
      return 'split-outcome-push';
    }

    return 'split-outcome-pending';
  }

  private markActiveSplitHandAwaitingCard(): void {
    if (this.activeSplitHandIndex === null) {
      return;
    }

    this.splitHands = this.splitHands.map((hand, index) => (
      index === this.activeSplitHandIndex
        ? {
          ...hand,
          status: 'awaiting_card',
        }
        : hand
    ));
  }

  private markActiveSplitHandAs(status: SplitHandStatus, hasDoubled = false): void {
    if (this.activeSplitHandIndex === null) {
      return;
    }

    this.splitHands = this.splitHands.map((hand, index) => (
      index === this.activeSplitHandIndex
        ? {
          ...hand,
          status,
          hasDoubled: hasDoubled || hand.hasDoubled,
        }
        : hand
    ));
  }

  private updateActiveSplitHandCards(cards: CardValue[]): void {
    if (this.activeSplitHandIndex === null) {
      return;
    }

    this.splitHands = this.splitHands.map((hand, index) => (
      index === this.activeSplitHandIndex
        ? {
          ...hand,
          cards: [...cards],
        }
        : hand
    ));
  }

  private advanceSplitRoundAfterCurrentHandResolution(): void {
    if (!this.isSplitRoundActive) {
      return;
    }

    const activeIndex = this.activeSplitHandIndex ?? 0;
    const nextPendingIndex = this.splitHands.findIndex((hand, index) => index > activeIndex && hand.status === 'pending');

    if (nextPendingIndex >= 0) {
      this.activeSplitHandIndex = nextPendingIndex;
      this.splitHands = this.splitHands.map((hand, index) => (
        index === nextPendingIndex
          ? {
            ...hand,
            status: 'awaiting_card',
          }
          : hand
      ));

      const nextCards = this.splitHands[nextPendingIndex]?.cards ?? [];
      this.tableState = {
        ...this.tableState,
        playerCards: [...nextCards],
        selectedTarget: 'player',
      };
      this.setRoundPhase('PLAYER_HIT_PENDING');
      this.analysisResponse = null;
      this.analysisError = '';
      this.actionGuidance = `${this.actionGuidance} Agora Mão ${nextPendingIndex + 1} ativa: registre a proxima carta.`;
      this.openCardSelectionModal(`Mão ${nextPendingIndex + 1} · selecione a próxima carta`);
      return;
    }

    this.activeSplitHandIndex = null;
    this.tableState = {
      ...this.tableState,
      selectedTarget: 'dealer_revealed',
    };
    this.setRoundPhase('DEALER_REVEAL_PENDING');
    this.analysisResponse = null;
    this.analysisError = '';
    this.actionGuidance = `${this.actionGuidance} Todas as maos splitadas foram concluídas. Revele a carta oculta do dealer.`;
    this.openCardSelectionModal('Selecione a carta oculta/revelada do dealer');
  }

  private finalizeSplitRoundAgainstDealerTotals(): void {
    const dealerEvaluation = this.dealerHandEvaluation;
    const dealerTotal = dealerEvaluation?.total ?? null;

    this.splitHandResults = this.splitHands.map((hand, index) => {
      const handEvaluation = evaluatePlayerHand(hand.cards);

      if (hand.status === 'bust' || handEvaluation.isBust) {
        return {
          handIndex: index,
          cards: [...hand.cards],
          total: handEvaluation.total,
          outcome: 'bust',
          reason: `Mão ${index + 1} estourou acima de 21 pontos.`,
          hasDoubled: hand.hasDoubled,
          isBust: true,
        } as SplitHandResult;
      }

      if (!dealerEvaluation) {
        return {
          handIndex: index,
          cards: [...hand.cards],
          total: handEvaluation.total,
          outcome: 'push',
          reason: `Mão ${index + 1} ficou sem total final do dealer para comparacao.`,
          hasDoubled: hand.hasDoubled,
          isBust: false,
        } as SplitHandResult;
      }

      if (dealerEvaluation.isBust) {
        return {
          handIndex: index,
          cards: [...hand.cards],
          total: handEvaluation.total,
          outcome: 'player_win',
          reason: `Mão ${index + 1} venceu porque o dealer estourou.`,
          hasDoubled: hand.hasDoubled,
          isBust: false,
        } as SplitHandResult;
      }

      if (handEvaluation.total > dealerEvaluation.total) {
        return {
          handIndex: index,
          cards: [...hand.cards],
          total: handEvaluation.total,
          outcome: 'player_win',
          reason: `Mão ${index + 1} venceu: ${handEvaluation.total} contra ${dealerEvaluation.total}.`,
          hasDoubled: hand.hasDoubled,
          isBust: false,
        } as SplitHandResult;
      }

      if (handEvaluation.total < dealerEvaluation.total) {
        return {
          handIndex: index,
          cards: [...hand.cards],
          total: handEvaluation.total,
          outcome: 'dealer_win',
          reason: `Mão ${index + 1} perdeu: ${handEvaluation.total} contra ${dealerEvaluation.total}.`,
          hasDoubled: hand.hasDoubled,
          isBust: false,
        } as SplitHandResult;
      }

      return {
        handIndex: index,
        cards: [...hand.cards],
        total: handEvaluation.total,
        outcome: 'push',
        reason: `Mão ${index + 1} terminou em push com ${handEvaluation.total}.`,
        hasDoubled: hand.hasDoubled,
        isBust: false,
      } as SplitHandResult;
    });

    const winCount = this.splitHandResults.filter((item) => item.outcome === 'player_win').length;
    const lossCount = this.splitHandResults.filter((item) => item.outcome === 'dealer_win' || item.outcome === 'bust').length;
    const pushCount = this.splitHandResults.filter((item) => item.outcome === 'push').length;

    const overallOutcome: RoundOutcome =
      winCount > 0 && lossCount === 0 && pushCount === 0
        ? 'player_win'
        : lossCount > 0 && winCount === 0 && pushCount === 0
          ? 'dealer_win'
          : 'push';

    const overallReason: RoundResultReason =
      overallOutcome === 'player_win'
        ? dealerEvaluation?.isBust
          ? 'dealer_bust'
          : 'player_higher_total'
        : overallOutcome === 'dealer_win'
          ? 'dealer_higher_total'
          : 'push_equal_total';

    this.roundResolution = {
      outcome: overallOutcome,
      reason: overallReason,
      playerTotal: this.splitHandResults[0]?.total ?? 0,
      dealerTotal,
      playerCards: this.splitHands.flatMap((hand) => hand.cards),
      dealerCards: [...this.dealerCards],
      hasDoubled: this.hasDoubled || this.splitHandResults.some((item) => item.hasDoubled),
      hasSurrendered: false,
      hasNaturalBlackjack: false,
      isPlayerBust: this.splitHandResults.every((item) => item.isBust),
      isDealerBust: dealerEvaluation?.isBust ?? false,
      isPush: overallOutcome === 'push',
      message: `Split encerrado com ${winCount} vitória(s), ${lossCount} derrota(s) e ${pushCount} push(es).`,
    };

    this.setRoundPhase('ROUND_RESULT');
    this.visualRoundPhase = 'round_finished';
    this.playerCardsLocked = true;
    this.doubleCardPending = false;
    this.actionGuidance = 'Dealer finalizado. Resultado por mão splitada calculado.';
  }

  private getStateWithAllSplitPlayerCards(): BlackjackTableState {
    if (!this.isSplitRoundActive) {
      return this.tableState;
    }

    const allSplitCards = this.splitHands.flatMap((hand) => hand.cards);
    return {
      ...this.tableState,
      playerCards: allSplitCards.length > 0 ? [...allSplitCards] : [...this.tableState.playerCards],
    };
  }

  private clearSplitRoundState(): void {
    this.splitHands = [];
    this.activeSplitHandIndex = null;
    this.splitHandResults = [];
    this.isSplitAcesRound = false;
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

  private executePreRoundAnalysis(isAutomatic: boolean): PreRoundAnalysisSnapshot | null {
    if (!this.showStartHandCard) {
      return null;
    }

    const preRoundAnalysis = buildPreRoundAnalysis(this.tableState, {
      number_of_decks: this.activeRules.number_of_decks ?? this.config.number_of_decks,
      bankroll: this.config.bankroll,
      minimum_bet: this.config.minimum_bet,
      risk_profile: this.config.risk_profile,
      is_auto_generated: isAutomatic,
    });

    this.preRoundAnalysis = preRoundAnalysis;
    this.preRoundAnalysisSignature = this.buildPreRoundAnalysisSignature();
    this.latestBettingData = preRoundAnalysis.betting;
    return preRoundAnalysis;
  }

  private buildPreRoundAnalysisSignature(): string {
    const shoeCountsSignature = this.tableState.shoeCounts
      .map((item) => `${item.value}:${item.count}`)
      .join('|');

    return [
      this.tableState.seenCards.join(','),
      shoeCountsSignature,
      this.config.number_of_decks,
      this.config.bankroll,
      this.config.minimum_bet,
      this.config.risk_profile,
    ].join('#');
  }

  private clonePreRoundAnalysis(analysis: PreRoundAnalysisSnapshot): PreRoundAnalysisSnapshot {
    return {
      ...analysis,
      counting: {
        ...analysis.counting,
      },
      betting: {
        ...analysis.betting,
      },
    };
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
