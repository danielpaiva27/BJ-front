import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AnalyzeHandRequest, AnalyzeHandResponse } from '../models/blackjack-analysis.models';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class BlackjackAnalysisService {
  private readonly endpoint = `${environment.apiBaseUrl}/analyze-hand`;

  constructor(private readonly http: HttpClient) {}

  analyzeHand(request: AnalyzeHandRequest): Observable<AnalyzeHandResponse> {
    return this.http.post<AnalyzeHandResponse>(this.endpoint, request);
  }
}
