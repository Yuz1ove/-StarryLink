/** UI projections only. A provider cannot promote its own output to an ACK. */
export type Source = 'live data' | 'simulation' | 'fixture' | 'derived' | 'unavailable';
export type Metric = 'latency' | 'reliability' | 'capacity' | 'energy' | 'availability' | 'risk' | 'deliveryProbability';
export type RouteCandidate = {
  id: string; hops: {id: string; label: string; layer: string}[];
  metrics: Record<Metric, number>; normalizedMetrics: Record<Metric, number>;
  utilities: Record<Metric, number>; weightedContributions: Record<Metric, number>;
  finalScore: number; status: 'eligible' | 'offline' | 'below-delivery-floor'; eligible: boolean;
  source: string; runs: number; nodes: string[]; links: string[];
};
export type ARCIProjectionState = {
  observation: string; worldState: string; memorySummary: string; candidateSummary: number;
  policyStatus: string; confidence: number | null; selectedAction: string | null;
  evidenceStatus: string; integrationStatus: string; authority: string;
};
export type ScenarioState = {
  timeline: {version:'cinematic-timeline-2'; durationSeconds:number; frames:Array<{phase:number;seconds:number;nextSeconds:number;stage:string;networkState:unknown;failures:unknown[];hazard:unknown;candidates:RouteCandidate[];routeId:string|null;routeStatus:string;confirmed:boolean;ack:unknown;relayProgress:number;events:string[]}>};
  contractVersion: '2.0'; scenarioId: 'disaster' | 'conflict'; scenarioType: string;
  title: string; mode: 'simulation'; source: string; timestamp: string; inputHash: string;
  regionStatus: string[]; availableAssets: string[]; networkState: unknown;
  sosRequests: unknown[]; candidates: RouteCandidate[];
  recommendation: {routeId: string | null; fallbackRouteId: string | null; status: string};
  deliveryStatus: {status: string; confirmed: boolean; mode: 'simulation'; ack: unknown};
  arciProjection: ARCIProjectionState;
};
export interface ScenarioAdapter { load(input: {scenarioId: string; excludedRouteIds?: string[]; dropAck?: boolean}): Promise<ScenarioState>; }
