// G5 스파이크 — 설계 OB-01 의 지표 모듈(LabelPolicy · MetricsRegistry). 작성: AI 초안 (Authorship: G).
import client from "prom-client";

/** 레이블 허용목록(design/17 §0.3) */
export const ALLOWED_LABELS = new Set(["app", "method", "route", "status_class", "code", "kind", "status", "consumer", "type", "outcome", "projection", "job", "channel", "mode", "table", "result", "state", "resource", "source", "layer", "usecase", "version"]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export class LabelPolicy {
  /** 정의 단계: 레이블 이름은 허용목록 안이어야 한다 */
  static validateDef(name: string, labels: readonly string[]) {
    const bad = labels.filter((l) => !ALLOWED_LABELS.has(l));
    if (bad.length) throw new Error(`지표 ${name}: 허용목록에 없는 레이블 ${bad.join(",")}`);
  }
  /** 기록 단계(보조선): 값에 UUID 가 들어오면 거부 */
  static valuesOk(labels: Record<string, string>) {
    return !Object.values(labels).some((v) => UUID.test(v));
  }
}

type Kind = "counter" | "histogram" | "gauge";
type Def = { name: string; help: string; kind: Kind; labels: readonly string[]; buckets?: number[] };

export class MetricsRegistry {
  readonly registry = new client.Registry();
  private metrics = new Map<string, { def: Def; m: client.Counter<string> | client.Histogram<string> | client.Gauge<string> }>();
  private dropped: client.Counter<string>;

  constructor(private mode: "dev" | "prod") {
    this.dropped = new client.Counter({ name: "pf_metrics_dropped_total", help: "버려진 기록 수", labelNames: ["result"], registers: [this.registry] });
  }
  define(def: Def) {
    LabelPolicy.validateDef(def.name, def.labels);
    const base = { name: def.name, help: def.help, labelNames: [...def.labels], registers: [this.registry] };
    const m = def.kind === "counter" ? new client.Counter(base) : def.kind === "gauge" ? new client.Gauge(base) : new client.Histogram({ ...base, buckets: def.buckets });
    this.metrics.set(def.name, { def, m });
  }
  private get(name: string, labels: Record<string, string>) {
    const e = this.metrics.get(name);
    if (!e) return this.fail(`등록되지 않은 지표 ${name}`, "unregistered");
    if (!LabelPolicy.valuesOk(labels)) return this.fail(`지표 ${name}: 레이블 값에 식별자 모양(UUID)`, "label_value");
    return e.m;
  }
  private fail(msg: string, result: string) {
    if (this.mode === "dev") throw new Error(msg); // 개발·시험에서는 예외
    this.dropped.inc({ result }); // 운영에서는 버리고 센다
    return null;
  }
  inc(name: string, labels: Record<string, string>, v = 1) { (this.get(name, labels) as client.Counter<string> | null)?.inc(labels, v); }
  observe(name: string, labels: Record<string, string>, v: number) { (this.get(name, labels) as client.Histogram<string> | null)?.observe(labels, v); }
  set(name: string, labels: Record<string, string>, v: number) { (this.get(name, labels) as client.Gauge<string> | null)?.set(labels, v); }
  async text() { return this.registry.metrics(); }
  get contentType() { return this.registry.contentType; }
}
