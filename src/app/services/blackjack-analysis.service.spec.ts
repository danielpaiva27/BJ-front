import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AnalyzeHandRequest } from '../models/blackjack-analysis.models';
import {
  MachineEvPreRoundRequest,
  MachineEvPreRoundResponse,
  PreRoundAnalysisRequest,
} from '../models/pre-round-analysis.models';
import { BlackjackAnalysisService } from './blackjack-analysis.service';

describe('BlackjackAnalysisService', () => {
  let service: BlackjackAnalysisService;
  let httpTestingController: HttpTestingController;
  const preRoundEndpoint = `${environment.apiBaseUrl}/pre-round-analysis`;
  const machineEvEndpoint = `${environment.apiBaseUrl}/pre-round-analysis/machine-ev`;
  const analyzeHandEndpoint = `${environment.apiBaseUrl}/analyze-hand`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BlackjackAnalysisService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(BlackjackAnalysisService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should post pre-round payload to /pre-round-analysis', () => {
    const payload: PreRoundAnalysisRequest = {
      number_of_decks: 6,
      seen_cards: ['2', '5', '10', 'A'],
      bankroll: 1000,
      minimum_bet: 10,
      systems: ['hi_lo', 'hi_opt_ii', 'wong_halves'],
      rules: {
        blackjack_payout: '3:2',
        dealer_hits_soft_17: false,
        double_allowed: true,
        double_after_split: true,
        surrender_allowed: false,
        max_splits: 3,
        dealer_peek: true,
      },
    };

    service.analyzePreRound(payload).subscribe();

    const request = httpTestingController.expectOne(preRoundEndpoint);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body).toEqual(
      jasmine.objectContaining({
        number_of_decks: 6,
        bankroll: 1000,
        minimum_bet: 10,
        systems: ['hi_lo', 'hi_opt_ii', 'wong_halves'],
      }),
    );
    expect((request.request.body as { seen_cards: string[] }).seen_cards.length).toBe(4);
    httpTestingController.expectNone(analyzeHandEndpoint);
    httpTestingController.expectNone(machineEvEndpoint);
    request.flush({
      cards_seen: 4,
      cards_remaining: 308,
      decks_remaining: 308 / 52,
      bankroll: 1000,
      minimum_bet: 10,
      policy: {
        policy_id: 'risk_capped_growth',
        policy_label: 'Crescimento com risco de quebra limitado',
        variance_per_unit: 1.3,
        risk_of_ruin_limit: 0.05,
        max_single_round_exposure: 0.05,
        max_bankroll_exposure: 0.05,
        risk_model: 'approx_exponential_gambler_ruin',
      },
      systems: [
        {
          system_id: 'hi_lo',
          label: 'Hi-Lo',
          level: 1,
          balanced: true,
          ace_reckoned: true,
          fractional: false,
          requires_ace_side_count: false,
          running_count: 0,
          true_count: 0,
          betting_true_count: 0,
          estimated_player_edge: 0,
          should_enter: false,
          suggested_units: 0,
          suggested_amount: 0,
          bankroll_exposure_percent: 0,
          max_protected_amount: 50,
          estimated_risk_of_ruin: 0.01,
          risk_of_ruin_limit: 0.05,
          risk_model: 'approx_exponential_gambler_ruin',
          variance_per_unit: 1.3,
          max_bet_by_risk: 50,
          max_single_round_exposure: 0.05,
          max_bet_by_exposure: 50,
          selected_bet_fraction: 0,
          kelly_fraction: 0,
          risk_limited_fraction: 0,
          minimum_bet_exceeds_risk_cap: false,
          recommendation_status: 'observe',
          recommendation_text: 'Aguardar',
          warnings: [],
          cards_seen: 4,
          cards_remaining: 308,
          decks_remaining: 308 / 52,
        },
      ],
      most_favorable_estimate_system_id: 'hi_lo',
    });
  });

  it('should post Machine EV payload to the dedicated endpoint', () => {
    const payload: MachineEvPreRoundRequest = {
      number_of_decks: 6,
      seen_cards: ['2', '5', '10', 'A'],
      bankroll: 1000,
      minimum_bet: 10,
      engine_mode: 'hybrid',
      include_debug_metrics: false,
      rules: {
        blackjack_payout: '3:2',
        dealer_hits_soft_17: false,
        double_allowed: true,
        double_after_split: true,
        surrender_allowed: false,
        max_splits: 3,
        dealer_peek: true,
      },
    };
    const response: MachineEvPreRoundResponse = {
      model_id: 'machine_ev',
      label: 'Machine EV',
      model_type: 'composition_ev',
      is_human_replicable: false,
      estimated_next_hand_edge: 0.011,
      risk_if_minimum_bet: 0.021,
      minimum_bankroll_required_for_minimum_bet: 1234.56,
      recommendation_status: 'machine_ev_minimum_bet_within_risk_limit',
      recommendation_text: 'Estimativa computacional baseada na composição real do shoe.',
    };
    let actualResponse: MachineEvPreRoundResponse | undefined;

    service.analyzeMachineEvPreRound(payload).subscribe((value) => {
      actualResponse = value;
    });

    const request = httpTestingController.expectOne(machineEvEndpoint);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body).toEqual(jasmine.objectContaining({
      number_of_decks: 6,
      seen_cards: ['2', '5', '10', 'A'],
      bankroll: 1000,
      minimum_bet: 10,
      engine_mode: 'hybrid',
      include_debug_metrics: false,
    }));
    httpTestingController.expectNone(preRoundEndpoint);
    httpTestingController.expectNone(analyzeHandEndpoint);

    request.flush(response);

    expect(actualResponse?.estimated_next_hand_edge).toBe(0.011);
    expect(actualResponse?.risk_if_minimum_bet).toBe(0.021);
    expect(actualResponse?.minimum_bankroll_required_for_minimum_bet).toBe(1234.56);
  });

  it('should send a Machine EV request snapshot instead of mutable input references', () => {
    const payload: MachineEvPreRoundRequest = {
      number_of_decks: 6,
      seen_cards: ['2', 'A'],
      bankroll: 1000,
      minimum_bet: 10,
      engine_mode: 'hybrid',
      include_debug_metrics: false,
      rules: {
        blackjack_payout: '3:2',
        dealer_hits_soft_17: false,
      },
    };

    service.analyzeMachineEvPreRound(payload).subscribe();
    payload.seen_cards.push('10');
    payload.rules!.dealer_hits_soft_17 = true;

    const request = httpTestingController.expectOne(machineEvEndpoint);
    expect(request.request.body.seen_cards).toEqual(['2', 'A']);
    expect(request.request.body.rules.dealer_hits_soft_17).toBeFalse();
    expect(request.request.body.include_debug_metrics).toBeFalse();
    request.flush({
      model_id: 'machine_ev',
      label: 'Machine EV',
      model_type: 'composition_ev',
      is_human_replicable: false,
      estimated_next_hand_edge: 0,
      risk_if_minimum_bet: null,
      minimum_bankroll_required_for_minimum_bet: null,
      recommendation_status: 'machine_ev_missing_wager_inputs',
      recommendation_text: 'Estimativa computacional indisponível para os dados opcionais.',
    });
  });

  it('should accept nullable Machine EV risk diagnostics', () => {
    const payload: MachineEvPreRoundRequest = {
      number_of_decks: 6,
      seen_cards: [],
      engine_mode: 'hybrid',
      include_debug_metrics: false,
    };
    let actualResponse: MachineEvPreRoundResponse | undefined;

    service.analyzeMachineEvPreRound(payload).subscribe((value) => {
      actualResponse = value;
    });

    const request = httpTestingController.expectOne(machineEvEndpoint);
    request.flush({
      model_id: 'machine_ev',
      label: 'Machine EV',
      model_type: 'composition_ev',
      is_human_replicable: false,
      estimated_next_hand_edge: -0.004,
      risk_if_minimum_bet: null,
      minimum_bankroll_required_for_minimum_bet: null,
      recommendation_status: 'machine_ev_missing_wager_inputs',
      recommendation_text: 'Dados de banca ou mínimo não informados.',
    });

    expect(actualResponse?.estimated_next_hand_edge).toBe(-0.004);
    expect(actualResponse?.risk_if_minimum_bet).toBeNull();
    expect(actualResponse?.minimum_bankroll_required_for_minimum_bet).toBeNull();
  });

  it('should post decision payload to /analyze-hand', () => {
    const payload: AnalyzeHandRequest = {
      player_hand: ['10', '6'],
      dealer_upcard: '10',
      seen_cards: ['2', '5', 'A'],
      rules: {
        number_of_decks: 6,
        dealer_hits_soft_17: false,
        blackjack_payout: '3:2',
        double_allowed: true,
        double_after_split: true,
        surrender_allowed: false,
        max_splits: 3,
        dealer_peek: true,
      },
      simulations: 100,
      seed: 42,
      bankroll: 1000,
      minimum_bet: 10,
      risk_profile: 'moderate',
    };

    service.analyzeHand(payload).subscribe();

    const request = httpTestingController.expectOne(analyzeHandEndpoint);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body).toEqual(
      jasmine.objectContaining({
        player_hand: ['10', '6'],
        dealer_upcard: '10',
        simulations: 100,
        bankroll: 1000,
        minimum_bet: 10,
        risk_profile: 'moderate',
      }),
    );
    expect((request.request.body as { systems?: unknown }).systems).toBeUndefined();
    httpTestingController.expectNone(preRoundEndpoint);
    httpTestingController.expectNone(machineEvEndpoint);
    request.flush({});
  });

  it('should keep endpoints isolated when both analyses are requested', () => {
    const preRoundPayload: PreRoundAnalysisRequest = {
      number_of_decks: 6,
      seen_cards: ['2', '5', '10', 'A'],
      bankroll: 1000,
      minimum_bet: 10,
      rules: {
        blackjack_payout: '3:2',
        dealer_hits_soft_17: false,
      },
    };
    const analyzePayload: AnalyzeHandRequest = {
      player_hand: ['10', '6'],
      dealer_upcard: '10',
      seen_cards: ['2', '5', 'A'],
      rules: {
        number_of_decks: 6,
        dealer_hits_soft_17: false,
        blackjack_payout: '3:2',
        double_allowed: true,
        double_after_split: true,
        surrender_allowed: false,
        max_splits: 3,
        dealer_peek: true,
      },
      simulations: 100,
      seed: 42,
      bankroll: 1000,
      minimum_bet: 10,
      risk_profile: 'moderate',
    };

    service.analyzePreRound(preRoundPayload).subscribe();
    service.analyzeHand(analyzePayload).subscribe();

    const requests = httpTestingController.match(() => true);
    expect(requests.length).toBe(2);
    expect(requests.map((item) => item.request.url).sort()).toEqual([analyzeHandEndpoint, preRoundEndpoint].sort());

    const preRoundRequest = requests.find((item) => item.request.url === preRoundEndpoint);
    const analyzeRequest = requests.find((item) => item.request.url === analyzeHandEndpoint);

    expect(preRoundRequest).toBeDefined();
    expect(analyzeRequest).toBeDefined();
    expect((preRoundRequest!.request.body as { player_hand?: unknown }).player_hand).toBeUndefined();
    expect((analyzeRequest!.request.body as { number_of_decks?: unknown }).number_of_decks).toBeUndefined();

    preRoundRequest!.flush({
      cards_seen: 4,
      cards_remaining: 308,
      decks_remaining: 308 / 52,
      bankroll: 1000,
      minimum_bet: 10,
      policy: {
        policy_id: 'risk_capped_growth',
        policy_label: 'Crescimento com risco de quebra limitado',
        variance_per_unit: 1.3,
        risk_of_ruin_limit: 0.05,
        max_single_round_exposure: 0.05,
        max_bankroll_exposure: 0.05,
        risk_model: 'approx_exponential_gambler_ruin',
      },
      systems: [],
      most_favorable_estimate_system_id: 'hi_lo',
    });
    analyzeRequest!.flush({ recommendation: { best_action: 'stand' }, actions: [] });
  });
});
