import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { ActionAnalysis, AnalyzeHandResponse } from './models/blackjack-analysis.models';
import { CardValue } from './models/blackjack-table.models';
import { BlackjackAnalysisService } from './services/blackjack-analysis.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let blackjackAnalysisServiceSpy: jasmine.SpyObj<BlackjackAnalysisService>;

  function buildAction(action: ActionAnalysis['action']): ActionAnalysis {
    return {
      action,
      ev: 0,
      win_rate: 0,
      lose_rate: 0,
      push_rate: 0,
      simulations: 100,
      wins: 0,
      losses: 0,
      pushes: 0,
      std_dev: 0,
      standard_error: 0,
      confidence_interval_95: [0, 0],
    };
  }

  function preparePlayerDecision(app: AppComponent, actions: ActionAnalysis['action'][]): void {
    app.tableState = {
      ...app.tableState,
      playerCards: ['10', '6'],
      dealerUpcard: '10',
      roundPhase: 'PLAYER_DECISION',
    };
    app.analysisResponse = {
      actions: actions.map((action) => buildAction(action)),
    };
  }

  function setPlayerDecisionState(app: AppComponent, playerCards: CardValue[], dealerUpcard: CardValue): void {
    app.tableState = {
      ...app.tableState,
      playerCards,
      dealerUpcard,
      dealerRevealedCards: [],
      roundPhase: 'PLAYER_DECISION',
    };
  }

  beforeEach(async () => {
    blackjackAnalysisServiceSpy = jasmine.createSpyObj<BlackjackAnalysisService>('BlackjackAnalysisService', ['analyzeHand']);
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: BlackjackAnalysisService, useValue: blackjackAnalysisServiceSpy }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should load default setup values', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.config.number_of_decks).toBe(6);
    expect(app.config.blackjack_payout).toBe('3:2');
    expect(app.config.risk_profile).toBe('moderate');
  });

  it('should render setup section before starting shoe', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Blackjack Risk Engine');
    expect(compiled.textContent).toContain('Iniciar shoe');
  });

  it('should render academic warning and visual shoe counters after starting shoe', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Ferramenta acadêmica e simulacional');
    expect(compiled.textContent).toContain('Estado do shoe');
    expect(compiled.textContent).toContain('Cartas restantes');
    expect(compiled.textContent).toContain('Cartas registradas');
  });

  it('should start shoe and change phase to card registration', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.tableState.gamePhase).toBe('shoe_active');
    expect(app.tableState.roundPhase).toBe('SHOE_ACTIVE');
    expect(compiled.textContent).toContain('Definir cartas');
  });

  it('should offer optional seen cards setup before current round starts', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Use esta etapa para informar cartas');
    expect(compiled.textContent).toContain('Aposta aceita / Iniciar mão');
    expect(app.availableCardTargets).toEqual([]);
  });

  it('should show pre-round analysis metrics before starting the hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Análise pré-rodada');
    expect(compiled.textContent).toContain('Running count');
    expect(compiled.textContent).toContain('True count');
    expect(compiled.textContent).toContain('Status do shoe');
    expect(compiled.textContent).toContain('Equivalente simulado');
    expect(compiled.textContent).toContain('10.00');
    expect(compiled.textContent).toContain('Aposta aceita / Iniciar mão');
  });

  it('should expose pre-round analyze button before starting the hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Analisar pré-rodada');
    expect(app.canAnalyzePreRound).toBeTrue();
  });

  it('should reanalyze pre-round metrics after seen cards change before hand start', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();

    const trueCountBefore = app.preRoundAnalysis?.counting.true_count ?? 0;
    const runningCountBefore = app.preRoundAnalysis?.counting.running_count ?? 0;

    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.registerCard('3');
    app.registerCard('4');
    app.registerCard('5');
    app.registerCard('6');
    app.confirmSeenCardsSetup();

    expect(app.preRoundAnalysisNeedsRefresh).toBeTrue();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Novas cartas foram registradas desde a última análise pré-rodada');

    app.analyzePreRound();

    expect((app.preRoundAnalysis?.counting.running_count ?? 0)).toBeGreaterThan(runningCountBefore);
    expect((app.preRoundAnalysis?.counting.true_count ?? 0)).toBeGreaterThan(trueCountBefore);
    expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();
  });

  it('should start hand without auto-running pre-round analysis when user skips manual analysis', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    expect(app.preRoundAnalysis).toBeNull();
    expect(app.currentRoundPreBetAnalysis).toBeNull();

    app.confirmBettingDecision();

    expect(app.tableState.roundPhase).toBe('INITIAL_DEAL');
    expect(app.preRoundAnalysis).toBeNull();
    expect(app.currentRoundPreBetAnalysis).toBeNull();
    expect(app.actionGuidance).toContain('Voce ainda nao executou a analise pre-rodada');
  });

  it('should allow returning to seen cards setup from betting decision after pre-round analysis', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('10');
    app.confirmSeenCardsSetup();
    app.analyzePreRound();

    const tenCountBefore = app.tableState.shoeCounts.find((item) => item.value === '10')?.count;

    expect(app.tableState.roundPhase).toBe('BETTING_DECISION');
    expect(app.showEnterSeenCardsSetup).toBeTrue();

    app.enterSeenCardsSetup();
    app.registerCard('9');
    app.confirmSeenCardsSetup();

    expect(app.tableState.roundPhase).toBe('BETTING_DECISION');
    expect(app.tableState.seenCards).toEqual(['10', '9']);
    expect(app.tableState.shoeCounts.find((item) => item.value === '9')?.count).toBe(23);
    expect(app.tableState.shoeCounts.find((item) => item.value === '10')?.count).toBe(tenCountBefore);
  });

  it('should keep seen-cards modal open while registering multiple seen cards', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();

    const twoCountBefore = app.tableState.shoeCounts.find((item) => item.value === '2')?.count ?? 0;
    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toBe('Registrar cartas vistas');

    app.handleModalCardSelected('2');
    app.handleModalCardSelected('3');
    app.handleModalCardSelected('10');

    expect(app.cardModalOpen).toBeTrue();
    expect(app.tableState.seenCards).toEqual(['2', '3', '10']);
    expect(app.tableState.shoeCounts.find((item) => item.value === '2')?.count).toBe(twoCountBefore - 1);
    expect(app.liveShoeCounting.running_count).toBe(1);
    expect(app.liveShoeCounting.cards_remaining).toBe(309);
    expect(Number.isFinite(app.liveShoeCounting.true_count)).toBeTrue();
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();

    app.closeCardSelectionModal();
    expect(app.cardModalOpen).toBeFalse();
  });

  it('should render live seen-cards counting outside the modal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.handleModalCardSelected('2');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Running Count');
    expect(compiled.textContent).toContain('True Count');
    expect(compiled.textContent).toContain('Cartas restantes');
    expect(compiled.textContent).toContain('Decks restantes');
    expect(app.liveShoeCounting.running_count).toBe(1);
  });

  it('should ignore unavailable seen card selection and keep the modal open', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.tableState = {
      ...app.tableState,
      shoeCounts: app.tableState.shoeCounts.map((item) => (
        item.value === 'A' ? { ...item, count: 0 } : item
      )),
    };

    app.handleModalCardSelected('A');

    expect(app.cardModalOpen).toBeTrue();
    expect(app.tableState.seenCards).toEqual([]);
    expect(app.tableState.shoeCounts.find((item) => item.value === 'A')?.count).toBe(0);
    expect(app.liveShoeCounting.running_count).toBe(0);
  });

  it('should undo the latest seen card from the continuous modal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.handleModalCardSelected('2');
    app.handleModalCardSelected('3');
    const threeCountAfterRegister = app.tableState.shoeCounts.find((item) => item.value === '3')?.count ?? 0;

    expect(app.canUndoLastSeenCardInModal).toBeTrue();
    app.undoLastSeenCardFromModal();

    expect(app.cardModalOpen).toBeTrue();
    expect(app.tableState.seenCards).toEqual(['2']);
    expect(app.tableState.shoeCounts.find((item) => item.value === '3')?.count).toBe(threeCountAfterRegister + 1);
    expect(app.liveShoeCounting.running_count).toBe(1);
  });

  it('should keep pre-round analysis stale after seen card changes without auto-calling decision analysis', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();

    app.enterSeenCardsSetup();
    app.handleModalCardSelected('2');

    expect(app.preRoundAnalysisNeedsRefresh).toBeTrue();
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Novas cartas foram registradas desde a',
    );
  });

  it('should ask confirmation when starting hand with stale pre-round analysis', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('10');
    app.confirmSeenCardsSetup();
    app.analyzePreRound();

    const lastSnapshotTimestamp = app.preRoundAnalysis?.generated_at ?? '';
    const lastRunningCount = app.preRoundAnalysis?.counting.running_count ?? 0;

    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.confirmSeenCardsSetup();

    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);

    app.confirmBettingDecision();

    expect(confirmSpy).toHaveBeenCalledWith('A análise pré-rodada está desatualizada. Deseja iniciar a mão mesmo assim?');
    expect(app.tableState.roundPhase).toBe('INITIAL_DEAL');
    expect(app.preRoundAnalysis?.generated_at).toBe(lastSnapshotTimestamp);
    expect(app.currentRoundPreBetAnalysis?.generated_at).toBe(lastSnapshotTimestamp);
    expect(app.currentRoundPreBetAnalysis?.counting.running_count).toBe(lastRunningCount);
    expect(app.actionGuidance).toContain('foi mantida sem recalculo automatico');
  });

  it('should keep observation phase when stale pre-round analysis confirmation is canceled', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('10');
    app.confirmSeenCardsSetup();
    app.analyzePreRound();
    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.confirmSeenCardsSetup();

    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);

    app.confirmBettingDecision();

    expect(confirmSpy).toHaveBeenCalledWith('A análise pré-rodada está desatualizada. Deseja iniciar a mão mesmo assim?');
    expect(app.tableState.roundPhase).toBe('BETTING_DECISION');
    expect(app.currentRoundPreBetAnalysis).toBeNull();
    expect(app.actionGuidance).toContain('Inicio da mao cancelado');
  });

  it('should keep pre-round snapshot frozen during the hand and show it in round result text', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.registerCard('3');
    app.registerCard('4');
    app.registerCard('5');
    app.registerCard('6');
    app.confirmSeenCardsSetup();
    app.analyzePreRound();

    const preRoundUnits = app.preRoundAnalysis?.betting.bet_units ?? 0;
    const preRoundEquivalent = app.preRoundAnalysis?.betting.suggested_bet ?? 0;

    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('9');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    app.onStand();
    app.handleModalCardSelected('7');

    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.currentRoundPreBetAnalysis?.betting.bet_units).toBe(preRoundUnits);
    expect(app.currentRoundPreBetAnalysis?.betting.suggested_bet).toBe(preRoundEquivalent);
    expect(app.roundResolutionReasonDescription).toContain('Exposicao teorica definida antes da mao');
  });

  it('should keep seen cards separate from the current round setup', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('5');
    app.confirmSeenCardsSetup();

    expect(app.tableState.roundPhase).toBe('BETTING_DECISION');
    expect(app.showSeenCardsDefinitionCard).toBeTrue();
    expect(app.availableCardTargets).toEqual([]);

    app.confirmBettingDecision();

    expect(app.tableState.seenCards).toEqual(['5']);
    expect(app.tableState.playerCards).toEqual([]);
    expect(app.tableState.dealerUpcard).toBeNull();
    expect(app.tableState.roundPhase).toBe('INITIAL_DEAL');
    expect(app.availableCardTargets).toEqual(['player']);
  });

  it('should guide initial deal as first player card, second player card, then dealer upcard', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();

    expect(app.tableState.roundPhase).toBe('INITIAL_DEAL');
    expect(app.tableState.selectedTarget).toBe('player');
    expect(app.initialDealProgressLabel).toBe('1/3: primeira carta do jogador');
    expect(app.initialDealPrompt).toContain('primeira carta do jogador');
    expect(app.availableCardTargets).toEqual(['player']);

    app.registerCard('10');

    expect(app.tableState.selectedTarget).toBe('player');
    expect(app.initialDealProgressLabel).toBe('2/3: segunda carta do jogador');
    expect(app.initialDealPrompt).toContain('segunda carta do jogador');
    expect(app.availableCardTargets).toEqual(['player']);

    app.registerCard('6');

    expect(app.tableState.selectedTarget).toBe('dealer_upcard');
    expect(app.initialDealProgressLabel).toBe('3/3: carta aberta do dealer');
    expect(app.initialDealPrompt).toContain('carta aberta do dealer');
    expect(app.availableCardTargets).toEqual(['dealer_upcard']);

    app.registerCard('9');

    expect(app.tableState.dealerUpcard).toBe('9');
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.canAnalyzeCurrentDecision).toBeTrue();
    expect(app.availableCardTargets).toEqual([]);
    expect(app.actionGuidance).toContain('Analisar decisao atual');
  });

  it('should use modal selection through the initial deal sequence', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();

    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toContain('1/3: primeira carta do jogador');

    app.handleModalCardSelected('10');

    expect(app.cardModalOpen).toBeFalse();
    expect(app.tableState.playerCards).toEqual(['10']);
    expect(app.currentCardRequestTitle).toContain('2/3: segunda carta do jogador');

    app.openCardSelectionModal();
    app.handleModalCardSelected('6');

    expect(app.tableState.playerCards).toEqual(['10', '6']);
    expect(app.currentCardRequestTitle).toContain('3/3: carta aberta do dealer');

    app.openCardSelectionModal();
    app.handleModalCardSelected('9');

    expect(app.cardModalOpen).toBeFalse();
    expect(app.tableState.dealerUpcard).toBe('9');
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.availableCardTargets).toEqual([]);
  });

  it('should route natural blackjack to dealer reveal flow after initial deal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.handleModalCardSelected('A');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('9');

    expect(app.tableState.playerCards).toEqual(['A', '10']);
    expect(app.tableState.dealerUpcard).toBe('9');
    expect(app.tableState.roundPhase).toBe('DEALER_REVEAL_PENDING');
    expect(app.tableState.selectedTarget).toBe('dealer_revealed');
    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toContain('Selecione a carta oculta/revelada do dealer');
    expect(app.canAnalyzeCurrentDecision).toBeFalse();
    expect(app.visiblePlayerActions).toEqual([]);
    expect(app.naturalBlackjackResult).toBeNull();

    app.handleModalCardSelected('8');

    expect(app.cardModalOpen).toBeFalse();
    expect(app.tableState.dealerRevealedCards).toEqual(['8']);
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.naturalBlackjackResult).toBe('player_win');
    expect(app.naturalBlackjackResultTitle).toContain('vitoria do jogador');
    expect(app.roundResolution?.hasNaturalBlackjack).toBeTrue();
    expect(app.showNaturalBlackjackStatus).toBeTrue();
    expect(app.visiblePlayerActions).toEqual([]);
  });

  it('should resolve natural blackjack as push when dealer also has blackjack', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.handleModalCardSelected('A');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('A');

    expect(app.tableState.roundPhase).toBe('DEALER_REVEAL_PENDING');

    app.handleModalCardSelected('10');

    expect(app.tableState.dealerUpcard).toBe('A');
    expect(app.tableState.dealerRevealedCards).toEqual(['10']);
    expect(app.dealerNaturalBlackjackDetected).toBeTrue();
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.naturalBlackjackResult).toBe('push');
    expect(app.naturalBlackjackResultTitle).toContain('empate/push');
    expect(app.roundResolution?.hasNaturalBlackjack).toBeTrue();
    expect(app.roundResolutionTitle).toContain('Push');
    expect(app.visiblePlayerActions).toEqual([]);
  });

  it('should not let current round cards be registered before going to initial deal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.registerCard('10');

    expect(app.tableState.playerCards).toEqual([]);
    expect(app.tableState.seenCards).toEqual([]);
    expect(app.cardRegistrationError).toContain('Registro de carta indisponivel');
  });

  it('should register card in selected target and decrement count', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('10');

    const tenCount = app.tableState.shoeCounts.find((item) => item.value === '10')?.count;
    expect(app.tableState.seenCards).toEqual(['10']);
    expect(tenCount).toBe(95);
    expect(app.cardRegistrationError).toBe('');
  });

  it('should ask for player cards before dealer upcard during initial deal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.selectTarget('dealer_upcard');
    app.registerCard('10');

    expect(app.tableState.playerCards).toEqual(['10']);
    expect(app.tableState.dealerUpcard).toBeNull();
    expect(app.initialDealPrompt).toContain('segunda carta do jogador');
  });

  it('should register dealer_revealed into separate section and seen cards', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.tableState = {
      ...app.tableState,
      roundPhase: 'DEALER_REVEAL_PENDING',
    };
    app.selectTarget('dealer_revealed');
    app.registerCard('8');

    expect(app.tableState.dealerRevealedCards).toEqual(['8']);
    expect(app.tableState.seenCards).toEqual(['8']);
  });

  it('should show only executable actions for 10,6 against dealer 10', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');

    expect(app.visiblePlayerActions).toEqual(['hit', 'stand', 'double']);
  });

  it('should show Split for 8,8 and hide Split for 9,7', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '6');
    expect(app.visiblePlayerActions).toContain('split');

    setPlayerDecisionState(app, ['9', '7'], '10');
    expect(app.visiblePlayerActions).not.toContain('split');
  });

  it('should show informational Split message without changing cards, shoe or round phase', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '6');

    const phaseBefore = app.tableState.roundPhase;
    const playerCardsBefore = [...app.tableState.playerCards];
    const dealerUpcardBefore = app.tableState.dealerUpcard;
    const shoeCountsBefore = app.tableState.shoeCounts.map((item) => ({ ...item }));

    app.onSplit();

    expect(app.actionGuidance).toContain('O suporte visual completo para Split sera implementado em uma etapa futura.');
    expect(app.actionGuidance).toContain('Split cria duas maos independentes a partir de um par');
    expect(app.tableState.roundPhase).toBe(phaseBefore);
    expect(app.tableState.playerCards).toEqual(playerCardsBefore);
    expect(app.tableState.dealerUpcard).toBe(dealerUpcardBefore);
    expect(app.tableState.shoeCounts).toEqual(shoeCountsBefore);
    expect(app.roundResolution).toBeNull();
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
  });

  it('should hide Split when player already doubled', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '6');
    app.hasDoubled = true;

    expect(app.visiblePlayerActions).not.toContain('split');
  });

  it('should hide Split when surrender was already used', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '6');
    app.hasSurrendered = true;

    expect(app.visiblePlayerActions).not.toContain('split');
  });

  it('should hide all normal player actions for natural blackjack', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['A', '10'], '9');

    expect(app.visiblePlayerActions).toEqual([]);
  });

  it('should hide player actions during dealer turn', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.tableState = {
      ...app.tableState,
      playerCards: ['10', '6'],
      dealerUpcard: '10',
      roundPhase: 'DEALER_TURN',
    };

    expect(app.visiblePlayerActions).toEqual([]);
  });

  it('should follow surrender rule toggle for executable actions', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.surrender_allowed = false;
    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');
    expect(app.visiblePlayerActions).not.toContain('surrender');

    app.config.surrender_allowed = true;
    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');
    expect(app.visiblePlayerActions).toContain('surrender');
  });

  it('should hide Double when table rule double_allowed is false', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.double_allowed = false;
    app.startShoe();
    setPlayerDecisionState(app, ['5', '6'], '6');

    expect(app.visiblePlayerActions).not.toContain('double');
  });

  it('should hide Double when player already has more than two cards', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['5', '3', '2'], '6');

    expect(app.visiblePlayerActions).toEqual(['hit', 'stand']);
    expect(app.visiblePlayerActions).not.toContain('double');
  });

  it('should remove Double, Split and Surrender after Hit', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.surrender_allowed = true;
    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');

    app.onHit();
    app.handleModalCardSelected('2');

    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.visiblePlayerActions).toEqual(['hit', 'stand']);
  });

  it('should keep engine recommendation visible but block non-executable recommended action', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '6', '2'], '10');
    app.analysisResponse = {
      recommendation: {
        best_action: 'double',
        monte_carlo_action: 'double',
        basic_strategy_action: 'stand',
        strategy_agreement: false,
        confidence: 0.6,
        explanation: 'Teste de recomendacao nao executavel',
      },
      actions: [buildAction('double'), buildAction('stand')],
    };

    expect(app.recommendedAction).toBe('double');
    expect(app.canExecutePlayerAction('double')).toBeFalse();
    expect(app.recommendedActionUnavailableReason).toContain('Dobrar so esta disponivel na decisao inicial');
  });

  it('should keep split recommendation visible while marking it unavailable when hand is not pair', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');
    app.analysisResponse = {
      recommendation: {
        best_action: 'split',
        monte_carlo_action: 'split',
        basic_strategy_action: 'stand',
        strategy_agreement: false,
        confidence: 0.64,
        explanation: 'Teste de recomendacao split nao executavel',
      },
      actions: [buildAction('split'), buildAction('stand')],
    };

    expect(app.recommendedAction).toBe('split');
    expect(app.canExecutePlayerAction('split')).toBeFalse();
    expect(app.recommendedActionUnavailableReason).toContain('Split so esta disponivel com pares');
  });

  it('should set player target and guidance on Hit', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    preparePlayerDecision(app, ['hit']);
    app.onHit();

    expect(app.tableState.selectedTarget).toBe('player');
    expect(app.tableState.roundPhase).toBe('PLAYER_HIT_PENDING');
    expect(app.actionGuidance).toContain('Pedir carta selecionado');
    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toContain('Selecione a carta comprada pelo jogador');
  });

  it('should register Hit card, update shoe/history and reanalyze with updated player hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const apiResponse: AnalyzeHandResponse = {
      recommendation: {
        best_action: 'stand',
        monte_carlo_action: 'stand',
        basic_strategy_action: 'stand',
        strategy_agreement: true,
        confidence: 0.71,
        explanation: 'Resposta apos hit',
      },
      actions: [buildAction('stand'), buildAction('hit')],
    };
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(of(apiResponse));

    app.startShoe();
    setPlayerDecisionState(app, ['10', '2'], '10');
    const nineCountBeforeHit = app.tableState.shoeCounts.find((item) => item.value === '9')?.count;
    app.onHit();
    app.handleModalCardSelected('9');

    expect(app.cardModalOpen).toBeFalse();
    expect(app.tableState.playerCards).toEqual(['10', '2', '9']);
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.tableState.history.length).toBe(1);
    expect(app.tableState.history[0].target).toBe('player');
    expect(app.tableState.history[0].value).toBe('9');
    expect(app.tableState.seenCards).toEqual([]);
    expect(app.tableState.shoeCounts.find((item) => item.value === '9')?.count).toBe((nineCountBeforeHit ?? 0) - 1);
    expect(blackjackAnalysisServiceSpy.analyzeHand).toHaveBeenCalled();
    expect(blackjackAnalysisServiceSpy.analyzeHand.calls.mostRecent().args[0].player_hand).toEqual(['10', '2', '9']);
    expect(app.analysisResponse).toEqual(apiResponse);
  });

  it('should finish the round as bust after Hit when player exceeds 21', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');

    app.onHit();
    app.handleModalCardSelected('10');

    expect(app.playerBustDetected).toBeTrue();
    expect(app.tableState.playerCards).toEqual(['10', '6', '10']);
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.visiblePlayerActions).toEqual([]);
    expect(app.actionGuidance).toBe('Jogador estourou. Rodada encerrada.');
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
  });

  it('should evaluate ace correctly after Hit in a low hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['5', '3'], '9');

    app.onHit();
    app.handleModalCardSelected('A');

    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.playerHandEvaluation.total).toBe(19);
    expect(app.playerHandEvaluation.isSoft).toBeTrue();
    expect(app.playerBustDetected).toBeFalse();
    expect(app.visiblePlayerActions).toEqual(['hit', 'stand']);
  });

  it('should move to dealer reveal flow on Stand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    preparePlayerDecision(app, ['stand']);
    app.onStand();

    expect(app.tableState.selectedTarget).toBe('dealer_revealed');
    expect(app.tableState.roundPhase).toBe('DEALER_REVEAL_PENDING');
    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toContain('Selecione a carta oculta/revelada do dealer');
    expect(app.actionGuidance).toContain('A vez do jogador terminou');
  });

  it('should close round after Stand when dealer reveals 17 or more and loses to player total', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '9'], '10');

    app.onStand();
    app.handleModalCardSelected('7');

    expect(app.tableState.dealerRevealedCards).toEqual(['7']);
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution?.outcome).toBe('player_win');
    expect(app.roundResolution?.playerTotal).toBe(19);
    expect(app.roundResolution?.dealerTotal).toBe(17);
    expect(app.roundResolutionTitle).toBe('Vitoria do jogador - 19 contra 17.');
    expect(app.visiblePlayerActions).toEqual([]);
  });

  it('should move to dealer turn and show draw button when dealer is below 17 after reveal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '8'], '6');

    app.onStand();
    app.handleModalCardSelected('5');

    expect(app.tableState.dealerRevealedCards).toEqual(['5']);
    expect(app.dealerHandEvaluation?.total).toBe(11);
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');
    expect(app.showDealerDrawButton).toBeTrue();
    expect(app.visiblePlayerActions).toEqual([]);
  });

  it('should keep round result button hidden until dealer hand is available', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.tableState = {
      ...app.tableState,
      playerCards: ['10', '8'],
      dealerUpcard: null,
      dealerRevealedCards: [],
      roundPhase: 'DEALER_TURN',
    };

    expect(app.showRoundResultButton).toBeFalse();
  });

  it('should still close round with a fallback result when dealer total is unavailable', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.tableState = {
      ...app.tableState,
      playerCards: ['10', '8'],
      dealerUpcard: null,
      dealerRevealedCards: [],
      roundPhase: 'DEALER_TURN',
    };

    app.showRoundResult();

    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution).not.toBeNull();
    expect(app.roundResolution?.dealerTotal).toBeNull();
    expect(app.showRoundResolutionCard).toBeTrue();
  });

  it('should keep dealer in turn after reveal with 16, waiting for next dealer draw', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '8'], '10');

    app.onStand();
    app.handleModalCardSelected('6');

    expect(app.dealerHandEvaluation?.total).toBe(16);
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');
    expect(app.showDealerDrawButton).toBeTrue();
  });

  it('should resolve push after Stand when dealer total equals player total', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '8'], '10');

    app.onStand();
    app.handleModalCardSelected('8');

    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution?.outcome).toBe('push');
    expect(app.roundResolution?.playerTotal).toBe(18);
    expect(app.roundResolution?.dealerTotal).toBe(18);
    expect(app.roundResolutionTitle).toBe('Empate - ambos terminaram com 18.');
  });

  it('should let dealer draw until 17 and then stop with resolved result', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '8'], '6');

    app.onStand();
    app.handleModalCardSelected('5');

    expect(app.dealerHandEvaluation?.total).toBe(11);
    expect(app.showDealerDrawButton).toBeTrue();

    app.startDealerDraw();
    app.handleModalCardSelected('6');

    expect(app.dealerHandEvaluation?.total).toBe(17);
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution?.outcome).toBe('player_win');
    expect(app.roundResolution?.playerTotal).toBe(18);
    expect(app.roundResolution?.dealerTotal).toBe(17);
  });

  it('should allow multiple dealer draws while dealer is below 17', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '9'], '2');

    app.onStand();
    app.handleModalCardSelected('3');

    expect(app.dealerHandEvaluation?.total).toBe(5);
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');
    expect(app.showDealerDrawButton).toBeTrue();

    app.startDealerDraw();
    app.handleModalCardSelected('4');

    expect(app.dealerHandEvaluation?.total).toBe(9);
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');
    expect(app.showDealerDrawButton).toBeTrue();

    app.startDealerDraw();
    app.handleModalCardSelected('8');

    expect(app.dealerHandEvaluation?.total).toBe(17);
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution?.outcome).toBe('player_win');
    expect(app.roundResolution?.playerTotal).toBe(19);
    expect(app.roundResolution?.dealerTotal).toBe(17);
  });

  it('should end round as player win when dealer busts after draw', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '8'], '10');

    app.onStand();
    app.handleModalCardSelected('6');

    expect(app.dealerHandEvaluation?.total).toBe(16);
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');
    expect(app.showDealerDrawButton).toBeTrue();

    app.startDealerDraw();
    app.handleModalCardSelected('10');

    expect(app.dealerHandEvaluation?.isBust).toBeTrue();
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution?.outcome).toBe('player_win');
    expect(app.roundResolution?.reason).toBe('dealer_bust');
    expect(app.roundResolutionTitle).toBe('Vitoria do jogador - dealer estourou.');
  });

  it('should stop on soft 17 when dealer_hits_soft_17 is false', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.dealer_hits_soft_17 = false;
    app.startShoe();
    setPlayerDecisionState(app, ['10', '8'], 'A');

    app.onStand();
    app.handleModalCardSelected('6');

    expect(app.dealerHandEvaluation?.total).toBe(17);
    expect(app.dealerHandEvaluation?.isSoft).toBeTrue();
    expect(app.dealerShouldDraw).toBeFalse();
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
  });

  it('should draw on soft 17 when dealer_hits_soft_17 is true', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.dealer_hits_soft_17 = true;
    app.startShoe();
    setPlayerDecisionState(app, ['10', '8'], 'A');

    app.onStand();
    app.handleModalCardSelected('6');

    expect(app.dealerHandEvaluation?.total).toBe(17);
    expect(app.dealerHandEvaluation?.isSoft).toBeTrue();
    expect(app.dealerShouldDraw).toBeTrue();
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');
    expect(app.showDealerDrawButton).toBeTrue();
  });

  it('should open Double modal with single-card title and then move automatically to dealer reveal when not bust', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['5', '6'], '6');

    app.onDouble();

    expect(app.tableState.roundPhase).toBe('PLAYER_DOUBLE_PENDING');
    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toContain('Selecione a única carta comprada pelo jogador no Double');

    app.handleModalCardSelected('10');

    expect(app.hasDoubled).toBeTrue();
    expect(app.playerCardsLocked).toBeTrue();
    expect(app.tableState.playerCards).toEqual(['5', '6', '10']);
    expect(app.tableState.selectedTarget).toBe('dealer_revealed');
    expect(app.tableState.roundPhase).toBe('DEALER_REVEAL_PENDING');
    expect(app.visiblePlayerActions).toEqual([]);
    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toContain('Selecione a carta oculta/revelada do dealer');
  });

  it('should finish round as player bust when Double card exceeds 21 and keep doubled flag in result', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['10', '2'], '6');

    app.onDouble();
    app.handleModalCardSelected('10');

    expect(app.cardModalOpen).toBeFalse();
    expect(app.hasDoubled).toBeTrue();
    expect(app.playerCardsLocked).toBeTrue();
    expect(app.playerBustDetected).toBeTrue();
    expect(app.tableState.playerCards).toEqual(['10', '2', '10']);
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution?.reason).toBe('player_bust');
    expect(app.roundResolution?.hasDoubled).toBeTrue();
    expect(app.roundResolutionReasonDescription).toContain('Double realizado');
    expect(app.visiblePlayerActions).toEqual([]);
  });

  it('should continue from Double to dealer reveal and resolve round with doubled flag when dealer stops', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['5', '6'], '10');

    app.onDouble();
    app.handleModalCardSelected('10');
    app.handleModalCardSelected('7');

    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.roundResolution?.outcome).toBe('player_win');
    expect(app.roundResolution?.playerTotal).toBe(21);
    expect(app.roundResolution?.dealerTotal).toBe(17);
    expect(app.roundResolution?.hasDoubled).toBeTrue();
  });

  it('should request dealer draw card through the modal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.tableState = {
      ...app.tableState,
      roundPhase: 'DEALER_TURN',
    };
    app.startDealerDraw();

    expect(app.cardModalOpen).toBeTrue();
    expect(app.cardModalTitle).toContain('Selecione a carta comprada pelo dealer');

    app.handleModalCardSelected('4');

    expect(app.cardModalOpen).toBeFalse();
    expect(app.tableState.dealerRevealedCards).toEqual(['4']);
    expect(app.tableState.seenCards).toEqual(['4']);
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');
  });

  it('should finalize visual round on Surrender', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    const tenCountBefore = app.tableState.shoeCounts.find((item) => item.value === '10')?.count;

    app.config.surrender_allowed = true;
    app.startShoe();
    preparePlayerDecision(app, ['surrender']);
    app.onSurrender();

    expect(confirmSpy).toHaveBeenCalledWith('Deseja realmente render-se nesta mão?');
    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.visualRoundPhase).toBe('round_finished');
    expect(app.roundResolution?.reason).toBe('player_surrender');
    expect(app.roundResolution?.hasSurrendered).toBeTrue();
    expect(app.showSurrenderStatus).toBeTrue();
    expect(app.roundResolutionTitle).toContain('Surrender');
    expect(app.roundResolutionReasonDescription).toContain('Jogador se rendeu. Rodada encerrada');
    expect(app.actionGuidance).toBe('Jogador se rendeu. Rodada encerrada.');
    expect(app.visiblePlayerActions).toEqual([]);
    expect(app.cardModalOpen).toBeFalse();
    expect(app.tableState.dealerRevealedCards).toEqual([]);
    expect(app.tableState.shoeCounts.find((item) => item.value === '10')?.count).toBe(tenCountBefore);
  });

  it('should keep round in PLAYER_DECISION when surrender confirmation is canceled', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);

    app.config.surrender_allowed = true;
    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');

    const tenCountBefore = app.tableState.shoeCounts.find((item) => item.value === '10')?.count;
    const playerCardsBefore = [...app.tableState.playerCards];
    const dealerUpcardBefore = app.tableState.dealerUpcard;

    app.onSurrender();

    expect(confirmSpy).toHaveBeenCalledWith('Deseja realmente render-se nesta mão?');
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.roundResolution).toBeNull();
    expect(app.hasSurrendered).toBeFalse();
    expect(app.tableState.playerCards).toEqual(playerCardsBefore);
    expect(app.tableState.dealerUpcard).toBe(dealerUpcardBefore);
    expect(app.tableState.shoeCounts.find((item) => item.value === '10')?.count).toBe(tenCountBefore);
    expect(app.visiblePlayerActions).toContain('surrender');
  });

  it('should allow starting a new round after surrender result', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    spyOn(window, 'confirm').and.returnValue(true);

    app.config.surrender_allowed = true;
    app.startShoe();
    setPlayerDecisionState(app, ['10', '6'], '10');
    app.onSurrender();

    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');

    const shoeCountsBeforeNextRound = app.tableState.shoeCounts.map((item) => ({ ...item }));

    app.startNextRound();

    expect(app.tableState.roundPhase).toBe('SHOE_ACTIVE');
    expect(app.tableState.playerCards).toEqual([]);
    expect(app.tableState.dealerUpcard).toBeNull();
    expect(app.tableState.seenCards).toEqual(['10', '6', '10']);
    expect(app.tableState.shoeCounts).toEqual(shoeCountsBeforeNextRound);
    expect(app.roundResolution).toBeNull();
  });

  it('should move current round known cards to seen cards without duplicating dealer revealed cards on next round', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.tableState = {
      ...app.tableState,
      seenCards: ['5', '8'],
      playerCards: ['10', '7'],
      dealerUpcard: '6',
      dealerRevealedCards: ['8'],
      roundPhase: 'ROUND_RESULT',
    };

    const shoeCountsBefore = app.tableState.shoeCounts.map((item) => ({ ...item }));

    app.startNextRound();

    expect(app.tableState.playerCards).toEqual([]);
    expect(app.tableState.dealerUpcard).toBeNull();
    expect(app.tableState.dealerRevealedCards).toEqual([]);
    expect(app.tableState.seenCards).toEqual(['5', '8', '10', '7', '6']);
    expect(app.tableState.shoeCounts).toEqual(shoeCountsBefore);

    app.startNextRound();

    expect(app.tableState.seenCards).toEqual(['5', '8', '10', '7', '6']);
    expect(app.tableState.shoeCounts).toEqual(shoeCountsBefore);
  });

  it('should call API and store response when decision analysis succeeds', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const apiResponse: AnalyzeHandResponse = {
      recommendation: {
        best_action: 'hit',
        monte_carlo_action: 'hit',
        basic_strategy_action: 'stand',
        strategy_agreement: false,
        confidence: 0.42,
        explanation: 'Resposta de teste',
      },
      betting: {
        suggested_bet: 20,
        bet_units: 2,
        risk_profile: 'moderate',
        explanation: 'Exposicao teorica simulada.',
      },
    };
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(of(apiResponse));

    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('5');
    app.confirmSeenCardsSetup();
    app.confirmBettingDecision();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).toHaveBeenCalled();
    expect(blackjackAnalysisServiceSpy.analyzeHand.calls.mostRecent().args[0].seen_cards).toEqual(['5']);
    expect(app.analysisResponse).toEqual(apiResponse);
    expect(app.latestBettingData).toEqual(apiResponse.betting);
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.analysisError).toBe('');
    expect(app.analysisLoading).toBeFalse();
  });

  it('should disable analyze button while loading', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analysisLoading = true;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('#analyze-button') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
  });

  it('should block analysis when player has fewer than 2 cards', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.selectTarget('player');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
    expect(app.analysisError).toContain('registre pelo menos 2 cartas do jogador');
  });

  it('should block analysis when dealer_upcard is not defined', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
    expect(app.analysisError).toContain('defina a carta aberta do dealer');
  });

  it('should show friendly error when API analysis fails', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(throwError(() => new Error('API unavailable')));

    app.startShoe();
    app.confirmBettingDecision();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).toHaveBeenCalled();
    expect(app.analysisResponse).toBeNull();
    expect(app.analysisError).toContain('Ocorreu um erro ao processar a análise');
    expect(app.analysisLoading).toBeFalse();
  });

  it('should show backend offline message when API is unreachable', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })),
    );

    app.startShoe();
    app.confirmBettingDecision();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(app.analysisError).toBe('Não foi possível conectar à API. Verifique se o backend está rodando.');
  });

  it('should show validation message for 422 response', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 422, statusText: 'Unprocessable Entity' })),
    );

    app.startShoe();
    app.confirmBettingDecision();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(app.analysisError).toBe('Entrada inválida. Confira as cartas e os parâmetros da simulação.');
  });

  it('should render decision panel with recommended action and ranking metrics', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const apiResponse: AnalyzeHandResponse = {
      actions: [
        {
          action: 'stand',
          ev: 0.12,
          win_rate: 0.45,
          lose_rate: 0.43,
          push_rate: 0.12,
          simulations: 1000,
          wins: 450,
          losses: 430,
          pushes: 120,
          std_dev: 1,
          standard_error: 0.01,
          confidence_interval_95: [0.1, 0.14],
        },
        {
          action: 'hit',
          ev: -0.2,
          win_rate: 0.35,
          lose_rate: 0.55,
          push_rate: 0.1,
          simulations: 1000,
          wins: 350,
          losses: 550,
          pushes: 100,
          std_dev: 1,
          standard_error: 0.01,
          confidence_interval_95: [-0.22, -0.18],
        },
      ],
      recommendation: {
        best_action: 'stand',
        monte_carlo_action: 'stand',
        basic_strategy_action: 'stand',
        strategy_agreement: true,
        confidence: 0.8,
        explanation: 'Melhor acao por valor esperado.',
      },
    };

    app.startShoe();
    app.analysisResponse = apiResponse;
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Decisão da engine');
    expect(compiled.textContent).toContain('Ação recomendada');
    expect(compiled.textContent).toContain('Parar (stand)');
    expect(compiled.textContent).toContain('1º');
    expect(compiled.textContent).toContain('+0.1200');
    expect(compiled.textContent).toContain('Pedir carta (hit)');
  });
});
