import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AnalyzeHandRequest } from '../models/blackjack-analysis.models';
import { PreRoundAnalysisRequest } from '../models/pre-round-analysis.models';
import { BlackjackAnalysisService } from './blackjack-analysis.service';

describe('BlackjackAnalysisService', () => {
  let service: BlackjackAnalysisService;
  let httpTestingController: HttpTestingController;

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
      rules: {
        blackjack_payout: '3:2',
        dealer_hits_soft_17: false,
        double_after_split: true,
        surrender_allowed: false,
        dealer_peek: true,
      },
    };

    service.analyzePreRound(payload).subscribe();

    const request = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/pre-round-analysis`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
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
      systems: [],
      most_favorable_estimate_system_id: 'hi_lo',
    });
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

    const request = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/analyze-hand`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({});
  });
});
