import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AnalyzeHandRequest, AnalyzeHandResponse } from '../models/blackjack-analysis.models';
import {
  MachineEvPreRoundRequest,
  MachineEvPreRoundResponse,
  PreRoundAnalysisRequest,
  PreRoundAnalysisResponse,
} from '../models/pre-round-analysis.models';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class BlackjackAnalysisService {
  private readonly analyzeHandEndpoint = `${environment.apiBaseUrl}/analyze-hand`;
  private readonly preRoundAnalysisEndpoint = `${environment.apiBaseUrl}/pre-round-analysis`;
  private readonly machineEvPreRoundEndpoint = `${environment.apiBaseUrl}/pre-round-analysis/machine-ev`;

  constructor(private readonly http: HttpClient) {}

  analyzeHand(request: AnalyzeHandRequest): Observable<AnalyzeHandResponse> {
    return this.http.post<AnalyzeHandResponse>(this.analyzeHandEndpoint, request);
  }

  analyzePreRound(request: PreRoundAnalysisRequest): Observable<PreRoundAnalysisResponse> {
    return this.http.post<PreRoundAnalysisResponse>(this.preRoundAnalysisEndpoint, request);
  }

  analyzeMachineEvPreRound(
    request: MachineEvPreRoundRequest,
  ): Observable<MachineEvPreRoundResponse> {
    const requestSnapshot: MachineEvPreRoundRequest = {
      ...request,
      seen_cards: [...request.seen_cards],
      rules: request.rules ? { ...request.rules } : undefined,
    };
    return this.http.post<MachineEvPreRoundResponse>(
      this.machineEvPreRoundEndpoint,
      requestSnapshot,
    );
  }
}
