import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';

import { ActionAnalysis, AnalyzeHandResponse } from './models/blackjack-analysis.models';
import { CardValue } from './models/blackjack-table.models';
import {
  MachineEvPreRoundResponse,
  PreRoundAnalysisRequest,
  PreRoundAnalysisResponse,
  PreRoundSystemResult,
} from './models/pre-round-analysis.models';
import { BlackjackAnalysisService } from './services/blackjack-analysis.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let blackjackAnalysisServiceSpy: jasmine.SpyObj<BlackjackAnalysisService>;

  function buildPreRoundSystem(
    system_id: PreRoundSystemResult['system_id'],
    label: string,
    runningCount: number,
    trueCount: number,
  ): PreRoundSystemResult {
    return {
      system_id,
      label,
      level: system_id === 'hi_lo' ? 1 : system_id === 'hi_opt_ii' ? 2 : 3,
      balanced: true,
      ace_reckoned: system_id !== 'hi_opt_ii',
      fractional: system_id === 'wong_halves',
      requires_ace_side_count: system_id === 'hi_opt_ii',
      running_count: runningCount,
      true_count: trueCount,
      betting_true_count: trueCount,
      estimated_player_edge: (trueCount * 0.005) - 0.005,
      should_enter: trueCount >= 2,
      suggested_units: trueCount >= 2 ? 1 : 0,
      suggested_amount: trueCount >= 2 ? 10 : 0,
      bankroll_exposure_percent: trueCount >= 2 ? 0.01 : 0,
      estimated_risk_of_ruin: trueCount >= 2 ? 0.03 : 0,
      risk_of_ruin_limit: 0.05,
      risk_model: 'approx_exponential_gambler_ruin',
      variance_per_unit: 1.3,
      max_bet_by_risk: trueCount >= 2 ? 15 : 0,
      max_single_round_exposure: 0.05,
      max_bet_by_exposure: 50,
      selected_bet_fraction: trueCount >= 2 ? 0.01 : 0,
      kelly_fraction: Math.max(0, ((trueCount * 0.005) - 0.005) / 1.3),
      risk_limited_fraction: trueCount >= 2 ? 0.015 : 0,
      risk_if_minimum_bet: null,
      minimum_bankroll_required_for_minimum_bet: null,
      minimum_bet_exceeds_risk_cap: false,
      recommendation_status: trueCount >= 2 ? 'minimum_unit' : 'observe',
      recommendation_text: trueCount >= 2
        ? 'Vantagem estimada pequena. A política sugere no máximo a unidade mínima.'
        : 'Sem vantagem estimada suficiente. A política sugere observar e continuar registrando cartas.',
      ...(system_id === 'hi_opt_ii'
        ? {
          playing_running_count: runningCount,
          playing_true_count: trueCount,
          betting_running_count: runningCount,
          ace_adjustment_factor: 2,
          ace_side_count: {
            total_aces: 24,
            seen_aces: 0,
            aces_remaining: 24,
            expected_aces_remaining: 24,
            excess_aces: 0,
          },
        }
        : {}),
      ...(system_id === 'wong_halves'
        ? {
          scaled_running_count: runningCount * 2,
          scale: 2,
        }
        : {}),
    };
  }

  function buildPreRoundResponse(request: PreRoundAnalysisRequest): PreRoundAnalysisResponse {
    const runningCount = request.seen_cards.reduce((total, card) => {
      if (['2', '3', '4', '5', '6'].includes(card)) {
        return total + 1;
      }
      if (card === '10' || card === 'A') {
        return total - 1;
      }
      return total;
    }, 0);
    const cardsRemaining = (request.number_of_decks * 52) - request.seen_cards.length;
    const decksRemaining = cardsRemaining > 0 ? cardsRemaining / 52 : 0;
    const trueCount = decksRemaining > 0 ? runningCount / decksRemaining : 0;

    return {
      cards_seen: request.seen_cards.length,
      cards_remaining: cardsRemaining,
      decks_remaining: decksRemaining,
      bankroll: request.bankroll,
      minimum_bet: request.minimum_bet,
      policy: {
        policy_id: 'risk_capped_growth',
        policy_label: 'Crescimento com risco de quebra limitado',
        description: 'Política de exposição simulada limitada por risco estimado.',
        variance_per_unit: 1.3,
        risk_of_ruin_limit: 0.05,
        max_single_round_exposure: 0.05,
        max_bankroll_exposure: 0.05,
        risk_model: 'approx_exponential_gambler_ruin',
      },
      systems: [
        buildPreRoundSystem('hi_lo', 'Hi-Lo', runningCount, trueCount),
        buildPreRoundSystem('hi_opt_ii', 'Hi-Opt II', runningCount, trueCount),
        buildPreRoundSystem('wong_halves', 'Wong Halves', runningCount / 2, trueCount / 2),
      ],
      most_favorable_estimate_system_id: 'hi_lo',
    };
  }

  function buildMachineEvResponse(
    overrides: Partial<MachineEvPreRoundResponse> = {},
  ): MachineEvPreRoundResponse {
    return {
      model_id: 'machine_ev',
      label: 'Machine EV',
      model_type: 'composition_ev',
      is_human_replicable: false,
      estimated_next_hand_edge: 0.011,
      risk_if_minimum_bet: 0.021,
      minimum_bankroll_required_for_minimum_bet: 1234.56,
      recommendation_status: 'machine_ev_minimum_bet_within_risk_limit',
      recommendation_text: 'A Machine EV estimou a vantagem da próxima mão usando a composição real do shoe.',
      ...overrides,
    };
  }

  function findPreRoundSystem(
    response: PreRoundAnalysisResponse | null,
    systemId: PreRoundSystemResult['system_id'],
  ): PreRoundSystemResult | undefined {
    return response?.systems.find((system) => system.system_id === systemId);
  }

  function assertPreRoundResponseContract(
    response: Pick<PreRoundAnalysisResponse, 'systems' | 'policy' | 'cards_seen' | 'cards_remaining' | 'decks_remaining'>,
  ): void {
    const systemIds = response.systems.map((system) => system.system_id);
    expect(systemIds).toEqual(['hi_lo', 'hi_opt_ii', 'wong_halves']);
    expect(new Set(systemIds).size).toBe(systemIds.length);

    for (const system of response.systems) {
      for (const requiredNumericField of [
        'true_count',
        'betting_true_count',
        'estimated_player_edge',
        'suggested_amount',
        'estimated_risk_of_ruin',
        'risk_of_ruin_limit',
      ] as const) {
        expect(Number.isFinite(system[requiredNumericField]))
          .withContext(`${system.system_id}.${requiredNumericField} should be finite`)
          .toBeTrue();
      }
    }

    const hiOptII = response.systems.find((system) => system.system_id === 'hi_opt_ii');
    expect(hiOptII).toBeDefined();
    expect(hiOptII?.ace_side_count).toBeDefined();
    expect(hiOptII?.playing_running_count).toBeDefined();
    expect(hiOptII?.betting_running_count).toBeDefined();

    const wongHalves = response.systems.find((system) => system.system_id === 'wong_halves');
    expect(wongHalves).toBeDefined();
    expect(wongHalves?.scaled_running_count).toBeDefined();
    expect(wongHalves?.scale).toBe(2);

    const serialized = JSON.stringify(response).toLowerCase();
    expect(serialized).not.toContain('nan');
    expect(serialized).not.toContain('infinity');
  }

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

  function dispatchWindowKey(key: string): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function dispatchWindowKeyEvent(eventInit: KeyboardEventInit): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...eventInit }));
  }

  function dispatchKeyOnElement(key: string, element: HTMLElement): void {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  beforeEach(async () => {
    blackjackAnalysisServiceSpy = jasmine.createSpyObj<BlackjackAnalysisService>(
      'BlackjackAnalysisService',
      ['analyzeHand', 'analyzePreRound', 'analyzeMachineEvPreRound'],
    );
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(of({}));
    blackjackAnalysisServiceSpy.analyzePreRound.and.callFake((request) => of(buildPreRoundResponse(request)));
    blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.and.returnValue(of(buildMachineEvResponse()));

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
    expect('risk_profile' in app.config).toBeFalse();
  });

  it('should render educational awareness screen on first load', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const awarenessScreen = compiled.querySelector('.awareness-screen');

    expect(awarenessScreen).not.toBeNull();
    expect(awarenessScreen?.textContent).toContain('Cassino não é sorte. É matemática contra você.');
    expect(awarenessScreen?.textContent).toContain('Entendi, continuar');
  });

  it('should hide awareness screen after user confirmation and keep setup flow visible', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const consentInput = compiled.querySelector('input[name="awareness_confirmation"]') as HTMLInputElement;
    const continueButton = compiled.querySelector('.awareness-button') as HTMLButtonElement;

    expect(continueButton.disabled).toBeTrue();

    consentInput.click();
    fixture.detectChanges();
    expect(continueButton.disabled).toBeFalse();

    continueButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.showAwarenessScreen).toBeFalse();
    expect(compiled.querySelector('.awareness-screen')).toBeNull();
    expect(compiled.textContent).toContain('Iniciar shoe');
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
    expect(compiled.textContent).toContain('Running Count');
    expect(compiled.textContent).toContain('True Count');
    expect(compiled.textContent).toContain('Hi-Lo');
    expect(compiled.textContent).toContain('Hi-Opt II');
    expect(compiled.textContent).toContain('Wong Halves');
    expect(compiled.textContent).toContain('Ace Side Count');
    expect(compiled.textContent).toContain('Scaled running count');
    expect(compiled.textContent).toContain('Equivalente simulado');
    expect(compiled.textContent).toContain('Risco estimado de quebra');
    expect(compiled.textContent).toContain('Sem exposicao sugerida');
    expect(compiled.textContent).toContain('Aposta aceita / Iniciar mão');
  });

  it('should not render intra-round Hi-Lo/risk panel after decision analysis', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(of({
      recommendation: {
        best_action: 'stand',
        monte_carlo_action: 'stand',
        basic_strategy_action: 'stand',
        strategy_agreement: true,
        confidence: 0.72,
        explanation: 'Cenario de teste para decisao da mao atual.',
      },
      actions: [
        {
          ...buildAction('stand'),
          ev: 0.12,
          win_rate: 0.45,
          lose_rate: 0.4,
          push_rate: 0.15,
        },
      ],
      counting: {
        running_count: 3,
        true_count: 0.9,
        cards_remaining: 300,
        deck_status: 'test',
      },
      betting: {
        suggested_bet: 20,
        bet_units: 2,
        risk_profile: 'moderate',
        explanation: 'Nao deve aparecer no bloco intra-rodada removido.',
      },
    }));

    app.startShoe();
    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    app.analyzeCurrentDecision();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Decisão da engine');
    expect(text).toContain('Ranking de ações');
    expect(text).not.toContain('Contagem Hi-Lo e risco simulacional');
    expect(text).not.toContain('Unidades teóricas');
    expect(text).not.toContain('Exposição teórica sugerida');
    expect(text).not.toContain('Modelo acadêmico/simulacional Hi-Lo');
    expect(text).not.toContain('Os valores desta seção são simulacionais');
  });

  it('should render Machine EV as a separate computational card with only public metrics', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const responseWithIgnoredDebug = {
      ...buildMachineEvResponse(),
      debug_metrics: {
        states_evaluated: 550,
        duration_ms: 12,
        cache_hits: 1,
        cache_misses: 549,
        warnings: ['internal warning'],
        precision_mode: 'exact_observable_initial_states',
        state_breakdown: [{ state: 'hidden' }],
        action_evs: { stand: 0.1 },
        dealer_hole_card: '10',
      },
      running_count: 12,
      true_count: 2,
      betting_true_count: 2,
      ace_side_count: { aces_remaining: 20 },
      scaled_running_count: 24,
    } as MachineEvPreRoundResponse;
    blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.and.returnValue(
      of(responseWithIgnoredDebug),
    );

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const machineSection = compiled.querySelector('.machine-ev-section');
    const machineCard = compiled.querySelector('.machine-ev-card');
    const humanGrid = compiled.querySelector('.pre-round-system-grid');
    const machineText = machineSection?.textContent ?? '';

    expect(machineSection).not.toBeNull();
    expect(machineCard).not.toBeNull();
    expect(humanGrid).not.toBeNull();
    expect(humanGrid?.contains(machineCard)).toBeFalse();
    expect(machineSection?.getAttribute('aria-labelledby')).toBe('machine-ev-title');
    expect(machineSection?.getAttribute('aria-describedby')).toBe('machine-ev-description');
    expect(machineSection?.querySelector('.machine-ev-metrics')).not.toBeNull();
    expect(machineSection?.querySelectorAll('.machine-ev-badge').length).toBe(2);
    expect(machineText).toContain('Machine EV');
    expect(machineText).toContain('Computacional');
    expect(machineText).toContain('Não replicável manualmente');
    expect(machineSection?.querySelectorAll('.machine-ev-metric').length).toBe(3);
    expect(machineText).toContain('Vantagem estimada da próxima mão');
    expect(machineText).toContain('Risco se apostar o mínimo');
    expect(machineText).toContain('Banca estimada necessária para esse mínimo');
    expect(machineText).toContain('+1.10%');
    expect(machineText).toContain('2.10%');
    expect(machineText).toContain('1.234,56');

    const normalizedText = machineText.toLowerCase();
    for (const hiddenField of [
      'states_evaluated',
      'duration_ms',
      'cache_hits',
      'cache_misses',
      'warnings',
      'precision_mode',
      'running_count',
      'true_count',
      'betting_true_count',
      'ace_side_count',
      'scaled_running_count',
      'action_evs',
      'state_breakdown',
      'dealer_hole_card',
      'suggested_units',
      'suggested_amount',
    ]) {
      expect(normalizedText).not.toContain(hiddenField);
    }
    for (const humanSystem of ['hi-lo', 'hi-opt ii', 'wong halves']) {
      expect(normalizedText).not.toContain(humanSystem);
    }
  });

  it('should expose responsive Machine EV structure without pixel-dependent assertions', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const section = (fixture.nativeElement as HTMLElement)
      .querySelector('.machine-ev-section');
    expect(section?.querySelector('.machine-ev-card')).not.toBeNull();
    expect(section?.querySelector('.machine-ev-metrics')).not.toBeNull();
    expect(section?.querySelectorAll('.machine-ev-metric').length).toBe(3);
    expect(section?.querySelectorAll('.machine-ev-value').length).toBe(3);
    expect(section?.querySelectorAll('.machine-ev-badge').length).toBe(2);
  });

  it('should render a concise empty Machine EV state before analysis', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    fixture.detectChanges();

    const section = (fixture.nativeElement as HTMLElement)
      .querySelector('.machine-ev-section');
    expect(section?.querySelector('.machine-ev-card')).toBeNull();
    expect(section?.querySelector('.machine-ev-empty')?.textContent)
      .toContain('Execute a análise pré-rodada');
  });

  it('should format Machine EV signed edge, optional risk and bankroll values', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    expect(app.formatSignedPercent(0.0123)).toBe('+1.23%');
    expect(app.formatSignedPercent(-0.004)).toBe('-0.40%');
    expect(app.formatSignedPercent(0)).toBe('0.00%');
    expect(app.formatSignedPercent(null)).toBe('—');
    expect(app.formatPercent(0.0213)).toBe('2.13%');
    expect(app.formatPercent(null)).toBe('—');
    expect(app.formatCurrencyOrNumber(null)).toBe('—');

    blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.and.returnValue(
      of(buildMachineEvResponse({
        estimated_next_hand_edge: -0.004,
        risk_if_minimum_bet: null,
        minimum_bankroll_required_for_minimum_bet: null,
      })),
    );

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.machine-ev-value'),
    ).map((element) => element.textContent?.trim());
    expect(values).toEqual(['-0.40%', '—', '—']);
  });

  it('should keep human cards available when Machine EV fails', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    spyOn(console, 'error');
    blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.preRoundAnalysis).not.toBeNull();
    expect(app.preRoundAnalysisError).toBeNull();
    expect(app.machineEvAnalysis).toBeNull();
    expect(app.machineEvError).toContain('Não foi possível calcular a Machine EV');
    expect(compiled.querySelectorAll('.pre-round-system-card').length).toBe(3);
    expect(compiled.textContent).toContain('Não foi possível calcular a Machine EV para este snapshot.');
    expect(compiled.querySelector('.machine-ev-error')?.getAttribute('role')).toBe('alert');
  });

  it('should use one immutable logical snapshot for human and Machine EV requests', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.bankroll = 1400;
    app.config.minimum_bet = 20;
    app.config.dealer_hits_soft_17 = true;
    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.registerCard('A');
    app.confirmSeenCardsSetup();

    app.analyzePreRound();

    const humanRequest =
      blackjackAnalysisServiceSpy.analyzePreRound.calls.mostRecent().args[0];
    const machineRequest =
      blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.calls.mostRecent().args[0];
    expect(machineRequest).toEqual(jasmine.objectContaining({
      number_of_decks: humanRequest.number_of_decks,
      seen_cards: humanRequest.seen_cards,
      bankroll: humanRequest.bankroll,
      minimum_bet: humanRequest.minimum_bet,
      rules: humanRequest.rules,
      engine_mode: 'hybrid',
      include_debug_metrics: false,
    }));
    expect(machineRequest.seen_cards).not.toBe(humanRequest.seen_cards);
    expect(machineRequest.rules).not.toBe(humanRequest.rules);

    app.enterSeenCardsSetup();
    app.registerCard('10');

    expect(humanRequest.seen_cards).toEqual(['2', 'A']);
    expect(machineRequest.seen_cards).toEqual(['2', 'A']);
  });

  it('should discard an old Machine EV response after the snapshot changes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const pendingMachineEv = new Subject<MachineEvPreRoundResponse>();
    blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.and.returnValue(
      pendingMachineEv.asObservable(),
    );

    app.startShoe();
    app.analyzePreRound();
    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.confirmSeenCardsSetup();

    pendingMachineEv.next(buildMachineEvResponse());
    pendingMachineEv.complete();

    expect(app.machineEvAnalysis).toBeNull();
    expect(app.machineEvError).toBeNull();
    expect(app.machineEvLoading).toBeFalse();
  });

  it('should discard an old Machine EV error after the snapshot changes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const pendingMachineEv = new Subject<MachineEvPreRoundResponse>();
    spyOn(console, 'error');
    blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.and.returnValue(
      pendingMachineEv.asObservable(),
    );

    app.startShoe();
    app.analyzePreRound();
    app.config.bankroll += 100;
    pendingMachineEv.error(new HttpErrorResponse({ status: 503 }));

    expect(app.machineEvAnalysis).toBeNull();
    expect(app.machineEvError).toBeNull();
    expect(app.machineEvLoading).toBeFalse();
  });

  it('should keep Machine EV visible when the human analysis fails', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    spyOn(console, 'error');
    blackjackAnalysisServiceSpy.analyzePreRound.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.preRoundAnalysis).toBeNull();
    expect(app.preRoundAnalysisError).not.toBeNull();
    expect(app.machineEvAnalysis).not.toBeNull();
    expect(app.machineEvError).toBeNull();
    expect(compiled.querySelector('.machine-ev-card')).not.toBeNull();
    expect(compiled.querySelectorAll('.pre-round-system-card').length).toBe(0);
  });

  it('should show Machine EV loading without blocking rendered human results', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const pendingMachineEv = new Subject<MachineEvPreRoundResponse>();
    blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.and.returnValue(
      pendingMachineEv.asObservable(),
    );

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.machineEvLoading).toBeTrue();
    expect(app.preRoundAnalysis).not.toBeNull();
    expect(compiled.textContent).toContain('Calculando Machine EV...');
    expect(compiled.querySelectorAll('.pre-round-system-card').length).toBe(3);
    expect(compiled.querySelector('.machine-ev-section')?.getAttribute('aria-busy')).toBe('true');
    expect(compiled.querySelector('.machine-ev-loading')?.getAttribute('role')).toBe('status');
    expect(compiled.querySelector('.machine-ev-loading')?.getAttribute('aria-live')).toBe('polite');

    pendingMachineEv.next(buildMachineEvResponse());
    pendingMachineEv.complete();

    expect(app.machineEvLoading).toBeFalse();
    expect(app.machineEvAnalysis).not.toBeNull();
  });

  it('should render Machine EV while the human analysis is still loading', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const pendingHuman = new Subject<PreRoundAnalysisResponse>();
    blackjackAnalysisServiceSpy.analyzePreRound.and.returnValue(
      pendingHuman.asObservable(),
    );

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.isPreRoundAnalysisLoading).toBeTrue();
    expect(app.machineEvLoading).toBeFalse();
    expect(app.machineEvAnalysis).not.toBeNull();
    expect(compiled.querySelector('.machine-ev-card')).not.toBeNull();
    expect(compiled.querySelectorAll('.pre-round-system-card').length).toBe(0);

    const humanRequest =
      blackjackAnalysisServiceSpy.analyzePreRound.calls.mostRecent().args[0];
    pendingHuman.next(buildPreRoundResponse(humanRequest));
    pendingHuman.complete();

    expect(app.isPreRoundAnalysisLoading).toBeFalse();
    expect(app.preRoundAnalysis).not.toBeNull();
  });

  it('should mark Machine EV as stale when the observed shoe changes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    expect(app.machineEvAnalysisNeedsRefresh).toBeFalse();

    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.confirmSeenCardsSetup();
    fixture.detectChanges();

    const machineSection = (fixture.nativeElement as HTMLElement)
      .querySelector('.machine-ev-section');
    expect(app.machineEvAnalysisNeedsRefresh).toBeTrue();
    expect(machineSection?.classList.contains('is-stale')).toBeTrue();
    expect(machineSection?.textContent).toContain('Desatualizado');
    expect(machineSection?.textContent).toContain('Recalcule após mudanças no shoe, banca ou regras');
    expect(machineSection?.querySelector('.machine-ev-stale-note')?.getAttribute('role')).toBe('status');
    expect(blackjackAnalysisServiceSpy.analyzeMachineEvPreRound).toHaveBeenCalledTimes(1);
  });

  it('should mark Machine EV stale after bankroll, minimum bet or rules change', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();

    const mutations: Array<() => void> = [
      () => {
        app.config.bankroll += 100;
      },
      () => {
        app.config.minimum_bet += 5;
      },
      () => {
        app.savedRules = {
          ...(app.savedRules ?? {}),
          dealer_hits_soft_17: !Boolean(app.savedRules?.dealer_hits_soft_17),
        };
      },
    ];

    for (const mutate of mutations) {
      mutate();
      expect(app.machineEvAnalysisNeedsRefresh).toBeTrue();
      app.analyzePreRound();
      expect(app.machineEvAnalysisNeedsRefresh).toBeFalse();
    }
  });

  it('should defensively format non-finite Machine EV values', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    expect(app.isFiniteNumber(0)).toBeTrue();
    expect(app.isFiniteNumber(Number.NaN)).toBeFalse();
    expect(app.isFiniteNumber(Number.POSITIVE_INFINITY)).toBeFalse();
    expect(app.formatSignedPercent(Number.NaN)).toBe('—');
    expect(app.formatSignedPercent(Number.NEGATIVE_INFINITY)).toBe('—');
    expect(app.formatPercent(Number.POSITIVE_INFINITY)).toBe('—');
    expect(app.formatCurrencyOrNumber(Number.NaN)).toBe('—');
  });

  it('should keep prohibited betting language out of the Machine EV card', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement)
      .querySelector('.machine-ev-section')
      ?.textContent?.toLowerCase() ?? '';
    for (const forbidden of [
      'garantido',
      'garantia',
      'aposta segura',
      'segura',
      'certeza',
      'vencer o cassino',
      'jogue agora',
      'chance certa',
      'lucro certo',
      'infalível',
      'aposta recomendada',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('should render positive-edge minimum-bet risk-cap status and diagnostic block', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const response = buildPreRoundResponse({
      number_of_decks: 6,
      seen_cards: [],
      bankroll: 200,
      minimum_bet: 5,
    });

    response.systems = response.systems.map((system) => ({
      ...system,
      estimated_player_edge: 0.0196,
      should_enter: false,
      suggested_units: 0,
      suggested_amount: 0,
      max_bet_by_risk: 2.01314566,
      estimated_risk_of_ruin: 0,
      risk_if_minimum_bet: 0.2993119,
      minimum_bankroll_required_for_minimum_bet: 496.73492,
      minimum_bet_exceeds_risk_cap: true,
      recommendation_status: 'positive_edge_minimum_bet_exceeds_risk_cap',
      recommendation_text: 'Ha vantagem estimada positiva, mas a menor aposta possivel (unidade minima) excede a exposicao permitida pelo limite aproximado de risco de quebra para a banca atual. A politica sugere observar ou usar uma banca maior para essa unidade.',
    }));

    blackjackAnalysisServiceSpy.analyzePreRound.and.returnValue(of(response));

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Vantagem positiva, minimo alto');
    expect(compiled.textContent).toContain('Vantagem positiva, mas unidade minima alta');
    expect(compiled.textContent).toContain('O shoe parece favoravel, mas a menor aposta possivel excede o limite de risco para a banca atual.');
    expect(compiled.textContent).toContain('Motivo:');
    expect(compiled.textContent).toContain('Unidade minima excede o limite de risco para a banca atual.');
    expect(compiled.textContent).toContain('Maximo permitido pelo risco');
    expect(compiled.textContent).toContain('Unidade minima');
    expect(compiled.textContent).toContain('Risco se apostar o minimo');
    expect(compiled.textContent).toContain('Banca estimada necessaria para esse minimo');
    expect(compiled.textContent).toContain('2.01');
    expect(compiled.textContent).toContain('5.00');
    expect(compiled.textContent).toContain('29.93%');
    expect(compiled.textContent).toContain('496.73');
    expect(compiled.querySelectorAll('.pre-round-status-positive-edge-minimum-bet-exceeds-risk-cap').length).toBe(3);

    const text = compiled.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('aposta segura');
    expect(text).not.toContain('garantia');
    expect(text).not.toContain('certeza');
    expect(text).not.toContain('lucro garantido');
    expect(text).toContain('hi-lo');
    expect(text).toContain('hi-opt ii');
    expect(text).toContain('wong halves');
  });

  it('should not render minimum-bet risk-cap diagnostic block for normal suggestions', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement)
      .querySelector('.pre-round-system-grid')
      ?.textContent ?? '';
    expect(text).not.toContain('Vantagem positiva, mas unidade minima alta');
    expect(text).not.toContain('Banca estimada necessaria para esse minimo');
  });

  it('should render estimated ruin risk without promise language', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    for (let index = 0; index < 15; index += 1) {
      app.registerCard('2');
    }
    app.confirmSeenCardsSetup();
    app.analyzePreRound();
    fixture.detectChanges();

    const preRoundCard = (fixture.nativeElement as HTMLElement)
      .querySelector('.pre-round-card');
    const text = preRoundCard?.textContent?.toLowerCase() ?? '';
    expect(text).toContain('risco estimado de quebra');
    expect(text).toContain('limite 5.00%');
    expect(text).not.toContain('aposta segura');
    expect(text).not.toContain('certeza');
    expect(text).not.toContain('lucro garantido');
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

  it('should call backend pre-round analysis with current shoe, bankroll and rules', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.number_of_decks = 6;
    app.config.bankroll = 1500;
    app.config.minimum_bet = 25;
    app.config.blackjack_payout = '6:5';
    app.config.dealer_hits_soft_17 = true;
    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.registerCard('A');
    app.confirmSeenCardsSetup();

    app.analyzePreRound();

    expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(1);
    const payload = blackjackAnalysisServiceSpy.analyzePreRound.calls.mostRecent().args[0];
    expect(payload).toEqual(jasmine.objectContaining({
      number_of_decks: 6,
      seen_cards: ['2', 'A'],
      bankroll: 1500,
      minimum_bet: 25,
      rules: jasmine.objectContaining({
        blackjack_payout: '6:5',
        dealer_hits_soft_17: true,
        double_after_split: true,
        surrender_allowed: false,
        dealer_peek: true,
      }),
    }));
    expect(payload.systems).toBeUndefined();
    expect(blackjackAnalysisServiceSpy.analyzeMachineEvPreRound).toHaveBeenCalledTimes(1);
    const machineEvPayload =
      blackjackAnalysisServiceSpy.analyzeMachineEvPreRound.calls.mostRecent().args[0];
    expect(machineEvPayload).toEqual(jasmine.objectContaining({
      number_of_decks: 6,
      seen_cards: ['2', 'A'],
      bankroll: 1500,
      minimum_bet: 25,
      engine_mode: 'hybrid',
      include_debug_metrics: false,
      rules: jasmine.objectContaining({
        blackjack_payout: '6:5',
        dealer_hits_soft_17: true,
        double_after_split: true,
        surrender_allowed: false,
        dealer_peek: true,
      }),
    }));
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
  });

  it('should keep pre-round snapshot coherent through hand start and decision analysis calls', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const pendingPreRoundResponse = new Subject<PreRoundAnalysisResponse>();
    const pendingDecisionResponse = new Subject<AnalyzeHandResponse>();

    blackjackAnalysisServiceSpy.analyzePreRound.and.returnValue(pendingPreRoundResponse.asObservable());
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(pendingDecisionResponse.asObservable());

    app.config.bankroll = 1200;
    app.config.minimum_bet = 20;
    app.config.dealer_hits_soft_17 = true;
    app.startShoe();
    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.registerCard('3');
    app.registerCard('4');
    app.registerCard('5');
    app.registerCard('6');
    app.registerCard('10');
    app.confirmSeenCardsSetup();

    app.analyzePreRound();

    expect(app.isPreRoundAnalysisLoading).toBeTrue();
    expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(1);

    const preRoundPayload = blackjackAnalysisServiceSpy.analyzePreRound.calls.mostRecent().args[0];
    expect(preRoundPayload).toEqual(jasmine.objectContaining({
      number_of_decks: 6,
      seen_cards: ['2', '3', '4', '5', '6', '10'],
      bankroll: 1200,
      minimum_bet: 20,
      rules: jasmine.objectContaining({
        dealer_hits_soft_17: true,
        blackjack_payout: '3:2',
      }),
    }));
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();

    const preRoundResponse = buildPreRoundResponse(preRoundPayload);
    assertPreRoundResponseContract(preRoundResponse);

    pendingPreRoundResponse.next(preRoundResponse);
    pendingPreRoundResponse.complete();

    expect(app.isPreRoundAnalysisLoading).toBeFalse();
    expect(app.preRoundAnalysis).toEqual(preRoundResponse);
    expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();

    app.confirmBettingDecision();

    expect(app.currentRoundPreBetAnalysis).not.toBeNull();
    expect(app.currentRoundPreBetAnalysis?.snapshot_stale).toBeFalse();
    assertPreRoundResponseContract(app.currentRoundPreBetAnalysis!);

    const snapshotBeforeDecisionAnalysis = JSON.stringify(app.currentRoundPreBetAnalysis);

    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');

    app.analyzeCurrentDecision();

    expect(app.analysisLoading).toBeTrue();
    expect(blackjackAnalysisServiceSpy.analyzeHand).toHaveBeenCalledTimes(1);

    const decisionPayload = blackjackAnalysisServiceSpy.analyzeHand.calls.mostRecent().args[0];
    expect(decisionPayload).toEqual(jasmine.objectContaining({
      player_hand: ['10', '6'],
      dealer_upcard: '10',
      seen_cards: ['2', '3', '4', '5', '6', '10'],
      bankroll: 1200,
      minimum_bet: 20,
      risk_profile: 'moderate',
      rules: jasmine.objectContaining({
        dealer_hits_soft_17: true,
        blackjack_payout: '3:2',
      }),
    }));

    const decisionResponse: AnalyzeHandResponse = {
      recommendation: {
        best_action: 'stand',
        monte_carlo_action: 'stand',
        basic_strategy_action: 'stand',
        strategy_agreement: true,
        confidence: 0.78,
        explanation: 'Cenario de teste integrado',
      },
      actions: [
        {
          action: 'stand',
          ev: 0.1,
          win_rate: 0.44,
          lose_rate: 0.42,
          push_rate: 0.14,
          simulations: 100,
          wins: 44,
          losses: 42,
          pushes: 14,
          std_dev: 1,
          standard_error: 0.01,
          confidence_interval_95: [0.08, 0.12],
        },
      ],
      betting: {
        suggested_bet: 20,
        bet_units: 1,
        risk_profile: 'moderate',
        explanation: 'Aposta em unidade minima para risco controlado.',
      },
    };

    pendingDecisionResponse.next(decisionResponse);
    pendingDecisionResponse.complete();

    expect(app.analysisLoading).toBeFalse();
    expect(app.analysisError).toBe('');
    expect(app.analysisResponse).toEqual(decisionResponse);
    expect(app.latestBettingData).toEqual(decisionResponse.betting);
    expect(app.currentRoundPreBetAnalysis).not.toBeNull();
    expect(JSON.stringify(app.currentRoundPreBetAnalysis)).toBe(snapshotBeforeDecisionAnalysis);
    assertPreRoundResponseContract(app.currentRoundPreBetAnalysis!);
  });

  it('should show loading and disable pre-round analysis while request is pending', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const pendingResponse = new Subject<PreRoundAnalysisResponse>();
    blackjackAnalysisServiceSpy.analyzePreRound.and.returnValue(pendingResponse.asObservable());

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    const analyzeButton = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Analisando')) as HTMLButtonElement;
    expect(app.isPreRoundAnalysisLoading).toBeTrue();
    expect(analyzeButton.disabled).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Consultando os três sistemas no backend');

    pendingResponse.next(buildPreRoundResponse({
      number_of_decks: 6,
      seen_cards: [],
      bankroll: 1000,
      minimum_bet: 10,
    }));
    pendingResponse.complete();

    expect(app.isPreRoundAnalysisLoading).toBeFalse();
  });

  it('should show friendly pre-round API error and keep the shoe functional', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    blackjackAnalysisServiceSpy.analyzePreRound.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })),
    );

    app.startShoe();
    app.analyzePreRound();
    fixture.detectChanges();

    expect(app.preRoundAnalysisError).toContain('Nao foi possivel conectar ao backend');
    expect(app.isPreRoundAnalysisLoading).toBeFalse();
    expect(app.tableState.roundPhase).toBe('SHOE_ACTIVE');
    expect(app.preRoundAnalysis).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nao foi possivel conectar ao backend');
  });

  it('should not render risk profile controls or labels', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent?.toLowerCase() ?? '';
    for (const forbidden of ['perfil de risco', 'conservador', 'moderado', 'agressivo']) {
      expect(text).not.toContain(forbidden);
    }
    expect((fixture.nativeElement as HTMLElement).querySelector('[name="risk_profile"]')).toBeNull();
  });

  it('should reanalyze pre-round metrics after seen cards change before hand start', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();

    const hiLoBefore = findPreRoundSystem(app.preRoundAnalysis, 'hi_lo');
    const trueCountBefore = hiLoBefore?.true_count ?? 0;
    const runningCountBefore = hiLoBefore?.running_count ?? 0;

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
    expect(compiled.textContent).toContain('Cartas vistas, banca ou regras mudaram desde a última análise pré-rodada');

    app.analyzePreRound();

    const hiLoAfter = findPreRoundSystem(app.preRoundAnalysis, 'hi_lo');
    expect((hiLoAfter?.running_count ?? 0)).toBeGreaterThan(runningCountBefore);
    expect((hiLoAfter?.true_count ?? 0)).toBeGreaterThan(trueCountBefore);
    expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();
    expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(2);
  });

  it('should mark pre-round analysis as stale after bankroll, minimum bet or rules changes without auto-calling backend', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();

    let expectedCalls = 1;
    expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();
    expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(expectedCalls);

    const mutations: Array<() => void> = [
      () => {
        app.config.bankroll += 100;
      },
      () => {
        app.config.minimum_bet += 5;
      },
      () => {
        app.savedRules = {
          ...(app.savedRules ?? {}),
          blackjack_payout: app.savedRules?.blackjack_payout === '3:2' ? '6:5' : '3:2',
        };
      },
      () => {
        app.savedRules = {
          ...(app.savedRules ?? {}),
          dealer_hits_soft_17: !Boolean(app.savedRules?.dealer_hits_soft_17),
        };
      },
    ];

    for (const mutate of mutations) {
      mutate();

      expect(app.preRoundAnalysisNeedsRefresh).toBeTrue();
      expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(expectedCalls);

      app.analyzePreRound();
      expectedCalls += 1;

      expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();
      expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(expectedCalls);
    }

    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
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

  it('should keep seen-cards action available after bet acceptance and during active hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();

    expect(app.tableState.roundPhase).toBe('INITIAL_DEAL');
    expect(app.showEnterSeenCardsSetup).toBeTrue();

    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');

    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.showEnterSeenCardsSetup).toBeTrue();

    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Registrar cartas vistas');
  });

  it('should register seen cards during active hand without resetting hand or accepted bet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('9');
    app.analyzeCurrentDecision();

    const playerBefore = [...app.tableState.playerCards];
    const dealerUpcardBefore = app.tableState.dealerUpcard;
    const seenCardsBefore = [...app.tableState.seenCards];
    const remainingBefore = app.remainingCards;

    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.analysisResponse).not.toBeNull();

    app.enterSeenCardsSetup();
    expect(app.tableState.roundPhase).toBe('SEEN_CARDS_SETUP');
    app.registerCard('2');
    app.confirmSeenCardsSetup();

    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.tableState.playerCards).toEqual(playerBefore);
    expect(app.tableState.dealerUpcard).toBe(dealerUpcardBefore);
    expect(app.tableState.seenCards).toEqual([...seenCardsBefore, '2']);
    expect(app.remainingCards).toBe(remainingBefore - 1);
    expect(app.analysisResponse).toBeNull();
  });

  it('should keep hand state valid when unavailable seen card is attempted during active hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.number_of_decks = 1;
    app.startShoe();
    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('9');

    const playerBefore = [...app.tableState.playerCards];
    const dealerUpcardBefore = app.tableState.dealerUpcard;

    app.enterSeenCardsSetup();
    const initialTwoCount = app.tableState.shoeCounts.find((item) => item.value === '2')?.count ?? 0;
    for (let index = 0; index < initialTwoCount; index += 1) {
      app.registerCard('2');
    }

    expect(app.tableState.shoeCounts.find((item) => item.value === '2')?.count).toBe(0);

    const historyBeforeExtra = app.tableState.history.length;
    app.registerCard('2');

    expect(app.cardRegistrationError).toContain('not available in the shoe');
    expect(app.tableState.history.length).toBe(historyBeforeExtra);
    expect(app.tableState.shoeCounts.find((item) => item.value === '2')?.count).toBe(0);
    expect(Math.min(...app.tableState.shoeCounts.map((item) => item.count))).toBeGreaterThanOrEqual(0);
    expect(app.tableState.playerCards).toEqual(playerBefore);
    expect(app.tableState.dealerUpcard).toBe(dealerUpcardBefore);
    expect(app.tableState.roundPhase).toBe('SEEN_CARDS_SETUP');

    app.confirmSeenCardsSetup();
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
  });

  it('should register seen card from keyboard shortcut during active hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('9');

    app.enterSeenCardsSetup();
    fixture.detectChanges();

    dispatchWindowKey('5');

    expect(app.tableState.seenCards).toContain('5');
    expect(app.cardModalOpen).toBeTrue();
    expect(app.isSeenCardsContinuousModal).toBeTrue();
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

  it('should register seen cards from keyboard shortcuts 1, 0 and 5 while keeping seen-cards modal open', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    fixture.detectChanges();

    const aceCountBefore = app.tableState.shoeCounts.find((item) => item.value === 'A')?.count ?? 0;
    const tenCountBefore = app.tableState.shoeCounts.find((item) => item.value === '10')?.count ?? 0;
    const fiveCountBefore = app.tableState.shoeCounts.find((item) => item.value === '5')?.count ?? 0;

    dispatchWindowKey('1');
    dispatchWindowKey('0');
    dispatchWindowKey('5');

    expect(app.tableState.seenCards).toEqual(['A', '10', '5']);
    expect(app.tableState.shoeCounts.find((item) => item.value === 'A')?.count).toBe(aceCountBefore - 1);
    expect(app.tableState.shoeCounts.find((item) => item.value === '10')?.count).toBe(tenCountBefore - 1);
    expect(app.tableState.shoeCounts.find((item) => item.value === '5')?.count).toBe(fiveCountBefore - 1);
    expect(app.cardModalOpen).toBeTrue();
    expect(app.liveShoeCounting.running_count).toBe(-1);
    expect(Number.isFinite(app.liveShoeCounting.true_count)).toBeTrue();
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
  });

  it('should map each seen-cards keyboard digit shortcut individually and keep stale-analysis behavior', () => {
    const scenarios: Array<{ key: string; value: CardValue }> = [
      { key: '1', value: 'A' },
      { key: '2', value: '2' },
      { key: '3', value: '3' },
      { key: '4', value: '4' },
      { key: '5', value: '5' },
      { key: '6', value: '6' },
      { key: '7', value: '7' },
      { key: '8', value: '8' },
      { key: '9', value: '9' },
      { key: '0', value: '10' },
    ];

    for (const scenario of scenarios) {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;

      app.startShoe();
      app.analyzePreRound();
      expect(app.preRoundAnalysisNeedsRefresh)
        .withContext(`pre-round should start fresh for key ${scenario.key}`)
        .toBeFalse();

      app.enterSeenCardsSetup();
      fixture.detectChanges();

      const valueCountBefore = app.tableState.shoeCounts.find((item) => item.value === scenario.value)?.count ?? 0;
      const remainingCardsBefore = app.remainingCards;
      const preRoundCallsBefore = blackjackAnalysisServiceSpy.analyzePreRound.calls.count();

      dispatchWindowKey(scenario.key);

      expect(app.tableState.seenCards)
        .withContext(`key ${scenario.key} should register ${scenario.value}`)
        .toEqual([scenario.value]);
      expect(app.tableState.shoeCounts.find((item) => item.value === scenario.value)?.count)
        .withContext(`key ${scenario.key} should decrement shoe count for ${scenario.value}`)
        .toBe(valueCountBefore - 1);
      expect(app.remainingCards)
        .withContext(`key ${scenario.key} should reduce total remaining cards`)
        .toBe(remainingCardsBefore - 1);
      expect(app.cardModalOpen)
        .withContext(`key ${scenario.key} should keep seen-cards modal open`)
        .toBeTrue();
      expect(app.isSeenCardsContinuousModal)
        .withContext(`key ${scenario.key} should keep seen-cards context active`)
        .toBeTrue();
      expect(app.preRoundAnalysisNeedsRefresh)
        .withContext(`key ${scenario.key} should mark pre-round analysis as stale`)
        .toBeTrue();
      expect(blackjackAnalysisServiceSpy.analyzePreRound.calls.count())
        .withContext(`key ${scenario.key} should not auto-trigger new pre-round analysis`)
        .toBe(preRoundCallsBefore);
      expect(blackjackAnalysisServiceSpy.analyzeHand.calls.count()).toBe(0);
    }
  });

  it('should update running count and true count with keyboard shortcuts in seen-cards modal', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    fixture.detectChanges();

    dispatchWindowKey('2');
    dispatchWindowKey('3');
    dispatchWindowKey('0');

    expect(app.tableState.seenCards).toEqual(['2', '3', '10']);
    expect(app.liveShoeCounting.running_count).toBe(1);
    expect(Number.isFinite(app.liveShoeCounting.true_count)).toBeTrue();
    expect(app.liveShoeCounting.cards_remaining).toBe(309);
  });

  it('should ignore seen-cards keyboard shortcuts while typing in input, textarea, select and contenteditable', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    app.enterSeenCardsSetup();
    fixture.detectChanges();

    const tempInput = document.createElement('input');
    const tempTextarea = document.createElement('textarea');
    const tempSelect = document.createElement('select');
    tempSelect.appendChild(document.createElement('option'));
    const tempEditable = document.createElement('div');
    tempEditable.setAttribute('contenteditable', 'true');

    document.body.appendChild(tempInput);
    document.body.appendChild(tempTextarea);
    document.body.appendChild(tempSelect);
    document.body.appendChild(tempEditable);

    const typingTargets: Array<{ label: string; element: HTMLElement }> = [
      { label: 'input', element: tempInput },
      { label: 'textarea', element: tempTextarea },
      { label: 'select', element: tempSelect },
      { label: 'contenteditable', element: tempEditable },
    ];

    try {
      for (const target of typingTargets) {
        target.element.focus();
        dispatchKeyOnElement('6', target.element);
        expect(app.tableState.seenCards)
          .withContext(`shortcut should be ignored while typing in ${target.label}`)
          .toEqual([]);
        expect(app.liveShoeCounting.running_count)
          .withContext(`running count should remain stable while typing in ${target.label}`)
          .toBe(0);
        expect(app.cardModalOpen)
          .withContext(`modal should stay open while typing in ${target.label}`)
          .toBeTrue();
      }
    } finally {
      tempInput.remove();
      tempTextarea.remove();
      tempSelect.remove();
      tempEditable.remove();
    }
  });

  it('should not apply seen-cards shortcuts while other modal contexts are open', () => {
    const scenarios: Array<{ label: string; setup: (app: AppComponent) => void }> = [
      {
        label: 'initial player modal',
        setup: (app) => {
          app.startShoe();
          app.confirmBettingDecision();
        },
      },
      {
        label: 'dealer upcard modal',
        setup: (app) => {
          app.startShoe();
          app.confirmBettingDecision();
          app.handleModalCardSelected('10');
          app.openCardSelectionModal();
          app.handleModalCardSelected('6');
          app.openCardSelectionModal();
        },
      },
      {
        label: 'player hit modal',
        setup: (app) => {
          app.startShoe();
          setPlayerDecisionState(app, ['10', '6'], '10');
          app.onHit();
        },
      },
      {
        label: 'player double modal',
        setup: (app) => {
          app.startShoe();
          setPlayerDecisionState(app, ['5', '6'], '10');
          app.onDouble();
        },
      },
      {
        label: 'dealer draw modal',
        setup: (app) => {
          app.startShoe();
          app.tableState = {
            ...app.tableState,
            roundPhase: 'DEALER_TURN',
          };
          app.startDealerDraw();
        },
      },
    ];

    for (const scenario of scenarios) {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;

      scenario.setup(app);
      fixture.detectChanges();

      expect(app.cardModalOpen).withContext(`${scenario.label} should have an open modal`).toBeTrue();
      expect(app.isSeenCardsContinuousModal).withContext(`${scenario.label} should not be seen-cards context`).toBeFalse();

      const seenCardsBefore = [...app.tableState.seenCards];
      const playerCardsBefore = [...app.tableState.playerCards];
      const dealerUpcardBefore = app.tableState.dealerUpcard;
      const dealerRevealedBefore = [...app.tableState.dealerRevealedCards];
      const historyCountBefore = app.tableState.history.length;
      const phaseBefore = app.tableState.roundPhase;

      dispatchWindowKey('8');

      expect(app.tableState.seenCards).withContext(`${scenario.label} should keep seen cards unchanged`).toEqual(seenCardsBefore);
      expect(app.tableState.playerCards).withContext(`${scenario.label} should keep player cards unchanged`).toEqual(playerCardsBefore);
      expect(app.tableState.dealerUpcard).withContext(`${scenario.label} should keep dealer upcard unchanged`).toBe(dealerUpcardBefore);
      expect(app.tableState.dealerRevealedCards).withContext(`${scenario.label} should keep dealer revealed cards unchanged`).toEqual(dealerRevealedBefore);
      expect(app.tableState.history.length).withContext(`${scenario.label} should not register extra history entries`).toBe(historyCountBefore);
      expect(app.tableState.roundPhase).withContext(`${scenario.label} should keep round phase unchanged`).toBe(phaseBefore);
      expect(app.cardModalOpen).withContext(`${scenario.label} should keep modal open`).toBeTrue();
    }
  });

  it('should stop keyboard registration when a seen card reaches zero availability', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.number_of_decks = 1;
    app.startShoe();
    app.enterSeenCardsSetup();
    fixture.detectChanges();

    const key = '2';
    const value: CardValue = '2';
    const initialCount = app.tableState.shoeCounts.find((item) => item.value === value)?.count ?? 0;
    expect(initialCount).toBeGreaterThan(0);

    for (let i = 0; i < initialCount; i += 1) {
      dispatchWindowKey(key);
    }

    expect(app.tableState.shoeCounts.find((item) => item.value === value)?.count).toBe(0);
    expect(app.tableState.seenCards).toEqual(Array.from({ length: initialCount }, () => value));
    expect(app.liveShoeCounting.running_count).toBe(initialCount);

    const seenCardsBeforeExtra = [...app.tableState.seenCards];
    const historyCountBeforeExtra = app.tableState.history.length;

    dispatchWindowKey(key);

    expect(app.tableState.seenCards).toEqual(seenCardsBeforeExtra);
    expect(app.tableState.history.length).toBe(historyCountBeforeExtra);
    expect(app.tableState.shoeCounts.find((item) => item.value === value)?.count).toBe(0);
    expect(Math.min(...app.tableState.shoeCounts.map((item) => item.count))).toBeGreaterThanOrEqual(0);
    expect(app.liveShoeCounting.running_count).toBe(initialCount);
    expect(app.cardRegistrationError).toContain('not available in the shoe');
    expect(app.cardModalOpen).toBeTrue();
  });

  it('should process repeated keydown events in seen-cards modal until shoe limit is reached', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.config.number_of_decks = 1;
    app.startShoe();
    app.enterSeenCardsSetup();
    fixture.detectChanges();

    const value: CardValue = '6';
    const initialCount = app.tableState.shoeCounts.find((item) => item.value === value)?.count ?? 0;
    expect(initialCount).toBeGreaterThan(0);

    for (let i = 0; i < initialCount + 2; i += 1) {
      dispatchWindowKeyEvent({ key: '6', repeat: true });
    }

    expect(app.tableState.seenCards).toEqual(Array.from({ length: initialCount }, () => value));
    expect(app.tableState.shoeCounts.find((item) => item.value === value)?.count).toBe(0);
    expect(app.liveShoeCounting.running_count).toBe(initialCount);
    expect(app.cardRegistrationError).toContain('not available in the shoe');
    expect(app.cardModalOpen).toBeTrue();
  });

  it('should keep pre-round analysis stale after seen-card keyboard registration without auto-analyzing', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();

    app.enterSeenCardsSetup();
    fixture.detectChanges();

    dispatchWindowKey('4');

    expect(app.tableState.seenCards).toEqual(['4']);
    expect(app.preRoundAnalysisNeedsRefresh).toBeTrue();
    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
    expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(1);
  });

  it('should keep pre-round and Machine EV snapshots stale after seen-card update during active hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analyzePreRound();
    expect(app.preRoundAnalysisNeedsRefresh).toBeFalse();
    expect(app.machineEvAnalysisNeedsRefresh).toBeFalse();

    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('6');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');

    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.confirmSeenCardsSetup();

    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.preRoundAnalysisNeedsRefresh).toBeTrue();
    expect(app.machineEvAnalysisNeedsRefresh).toBeTrue();
  });

  it('should support Backspace/Delete undo and Enter/Escape close in seen-cards modal shortcuts', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();
    fixture.detectChanges();

    dispatchWindowKey('2');
    dispatchWindowKey('3');
    expect(app.tableState.seenCards).toEqual(['2', '3']);

    dispatchWindowKey('Backspace');
    expect(app.tableState.seenCards).toEqual(['2']);

    dispatchWindowKey('Delete');
    expect(app.tableState.seenCards).toEqual([]);

    dispatchWindowKey('Enter');
    expect(app.cardModalOpen).toBeFalse();

    app.openCardSelectionModal('Registrar cartas vistas');
    expect(app.cardModalOpen).toBeTrue();

    dispatchWindowKey('Escape');
    expect(app.cardModalOpen).toBeFalse();
  });

  it('should expose seen-cards helper text with keyboard shortcut hint', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.enterSeenCardsSetup();

    expect(app.seenCardsModalHelperText).toContain('Atalhos: 1=A, 2-9=valores, 0=10');
    expect(app.seenCardsModalHelperText).toContain('Backspace/Delete');
    expect(app.seenCardsModalHelperText).toContain('Enter/Escape');
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
    expect(blackjackAnalysisServiceSpy.analyzePreRound).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Cartas vistas, banca ou regras mudaram desde a',
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

    const lastRunningCount = findPreRoundSystem(app.preRoundAnalysis, 'hi_lo')?.running_count ?? 0;

    app.enterSeenCardsSetup();
    app.registerCard('2');
    app.confirmSeenCardsSetup();

    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);

    app.confirmBettingDecision();

    expect(confirmSpy).toHaveBeenCalledWith('A análise pré-rodada está desatualizada. Deseja iniciar a mão mesmo assim?');
    expect(app.tableState.roundPhase).toBe('INITIAL_DEAL');
    expect(findPreRoundSystem(app.preRoundAnalysis, 'hi_lo')?.running_count).toBe(lastRunningCount);
    expect(findPreRoundSystem(app.currentRoundPreBetAnalysis, 'hi_lo')?.running_count).toBe(lastRunningCount);
    expect(app.currentRoundPreBetAnalysis?.snapshot_stale).toBeTrue();
    expect(app.currentRoundPreBetAnalysis?.captured_at).toBeTruthy();
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

    const preRoundHiLo = findPreRoundSystem(app.preRoundAnalysis, 'hi_lo');
    const preRoundUnits = preRoundHiLo?.suggested_units ?? 0;
    const preRoundEquivalent = preRoundHiLo?.suggested_amount ?? 0;

    app.confirmBettingDecision();
    app.handleModalCardSelected('10');
    app.openCardSelectionModal();
    app.handleModalCardSelected('9');
    app.openCardSelectionModal();
    app.handleModalCardSelected('10');
    app.onStand();
    app.handleModalCardSelected('7');

    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    const snapshotHiLo = findPreRoundSystem(app.currentRoundPreBetAnalysis, 'hi_lo');
    expect(snapshotHiLo?.suggested_units).toBe(preRoundUnits);
    expect(snapshotHiLo?.suggested_amount).toBe(preRoundEquivalent);
    expect(app.currentRoundPreBetAnalysis?.snapshot_stale).toBeFalse();
    expect(app.roundResolutionReasonDescription).toContain('Analise pre-rodada registrada');
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

  it('should split 8,8 into two hands and keep first hand 8,10 as non-bust', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '10');
    const tenCountBefore = app.tableState.shoeCounts.find((item) => item.value === '10')?.count ?? 0;

    app.onSplit();

    expect(app.splitHands.length).toBe(2);
    expect(app.activeSplitHandIndex).toBe(0);
    expect(app.splitHands[0].cards).toEqual(['8']);
    expect(app.splitHands[1].cards).toEqual(['8']);
    expect(app.tableState.roundPhase).toBe('PLAYER_HIT_PENDING');

    app.handleModalCardSelected('10');

    expect(app.splitHands[0].cards).toEqual(['8', '10']);
    expect(app.splitHands[1].cards).toEqual(['8']);
    expect(app.activeSplitHandIndex).toBe(0);
    expect(app.playerHandEvaluation.total).toBe(18);
    expect(app.playerBustDetected).toBeFalse();
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
    expect(app.tableState.playerCards).toEqual(['8', '10']);
    expect(app.tableState.playerCards).not.toEqual(['8', '8', '10']);
    expect(app.tableState.shoeCounts.find((item) => item.value === '10')?.count).toBe(tenCountBefore - 1);
  });

  it('should allow bust in first split hand without ending second split hand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '10');

    app.onSplit();
    app.handleModalCardSelected('10');
    app.onHit();
    app.handleModalCardSelected('9');

    expect(app.splitHands[0].cards).toEqual(['8', '10', '9']);
    expect(app.splitHands[0].status).toBe('bust');
    expect(app.activeSplitHandIndex).toBe(1);
    expect(app.splitHands[1].cards).toEqual(['8']);
    expect(app.tableState.playerCards).toEqual(['8']);
    expect(app.tableState.roundPhase).toBe('PLAYER_HIT_PENDING');
    expect(app.tableState.roundPhase).not.toBe('ROUND_RESULT');
  });

  it('should advance from split hand 1 stand to split hand 2', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '6');

    app.onSplit();
    app.handleModalCardSelected('10');
    app.onStand();

    expect(app.splitHands[0].status).toBe('stood');
    expect(app.activeSplitHandIndex).toBe(1);
    expect(app.tableState.roundPhase).toBe('PLAYER_HIT_PENDING');
    expect(app.tableState.playerCards).toEqual(['8']);

    app.handleModalCardSelected('3');

    expect(app.splitHands[1].cards).toEqual(['8', '3']);
    expect(app.tableState.playerCards).toEqual(['8', '3']);
    expect(app.tableState.roundPhase).toBe('PLAYER_DECISION');
  });

  it('should resolve split results per hand after dealer plays once', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    setPlayerDecisionState(app, ['8', '8'], '6');

    app.onSplit();
    app.handleModalCardSelected('10');
    app.onStand();

    app.handleModalCardSelected('3');
    app.onHit();
    app.handleModalCardSelected('10');
    app.onStand();

    expect(app.tableState.roundPhase).toBe('DEALER_REVEAL_PENDING');

    app.handleModalCardSelected('10');
    expect(app.tableState.roundPhase).toBe('DEALER_TURN');

    app.startDealerDraw();
    app.handleModalCardSelected('2');

    expect(app.tableState.roundPhase).toBe('ROUND_RESULT');
    expect(app.splitHandResults.length).toBe(2);
    expect(app.splitHandResults[0].outcome).toBe('push');
    expect(app.splitHandResults[1].outcome).toBe('player_win');
    expect(app.roundResolution).not.toBeNull();
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
