import { describe, expect, test } from "bun:test";
import { buildGraph, health, hostsIn, layoutGraph, matchesQuery, visibleGraph } from "../home/dot_config/herdr-app/mods/kube/model.js";

const obj = (kind, ns, name, { labels, owner, spec = {}, status = {}, data, apiVersion } = {}) => ({
  kind, apiVersion,
  metadata: { name, namespace: ns, labels, ownerReferences: owner ? [{ kind: owner[0], name: owner[1], controller: true }] : undefined },
  spec, status, ...(data ? { data } : {}),
});
const tpl = (labels, containers) => ({ template: { metadata: { labels }, spec: { containers } } });
const ready = { phase: "Running", conditions: [{ type: "Ready", status: "True" }], containerStatuses: [{ name: "c", ready: true, restartCount: 0 }] };
const pod = (ns, name, owner, labels, containers = [{ name: "c" }], status = ready) => obj("Pod", ns, name, { owner, labels, spec: { containers }, status });

const loomdC = [{ name: "loomd", env: [{ name: "LOOM_ADDR", value: "0.0.0.0:7800" }, { name: "LOOM_WORKER_URL", value: "http://loom-worker:7801" }, { name: "LOOM_PG_URL", valueFrom: { secretKeyRef: { name: "pg", key: "url" } } }] }];
const workerC = [{ name: "worker", envFrom: [{ configMapRef: { name: "loom-config" } }] }];
const supC = [{ name: "supervisor", env: [{ name: "OPENSHELL_ENDPOINT", value: "https://openshell.openshell.svc.cluster.local:8080" }] }];

const items = [
  obj("Namespace", undefined, "loom"), obj("Namespace", undefined, "openshell"), obj("Namespace", undefined, "kube-system"),
  obj("Deployment", "loom", "loomd", { spec: { replicas: 1, ...tpl({ app: "loomd" }, loomdC) }, status: { readyReplicas: 1 } }),
  obj("ReplicaSet", "loom", "loomd-abc", { owner: ["Deployment", "loomd"], spec: { replicas: 1 } }),
  obj("ReplicaSet", "loom", "loomd-old", { owner: ["Deployment", "loomd"], spec: { replicas: 0 } }),
  pod("loom", "loomd-abc-1", ["ReplicaSet", "loomd-abc"], { app: "loomd" }, loomdC),
  obj("Deployment", "loom", "loom-worker", { spec: { replicas: 1, ...tpl({ app: "loom-worker" }, workerC) }, status: { readyReplicas: 1 } }),
  obj("ConfigMap", "loom", "loom-config", { data: { OPENSHELL_GATEWAY_URL: "https://openshell.openshell.svc.cluster.local:8080", LOOM_MODEL: "faux" } }),
  obj("StatefulSet", "loom", "postgres", { spec: { replicas: 1, volumeClaimTemplates: [{ metadata: { name: "data" } }], ...tpl({ app: "postgres" }, [{ name: "pg" }]) }, status: { readyReplicas: 1 } }),
  pod("loom", "postgres-0", ["StatefulSet", "postgres"], { app: "postgres" }),
  obj("PersistentVolumeClaim", "loom", "data-postgres-0", { status: { phase: "Bound", capacity: { storage: "1Gi" } } }),
  obj("Service", "loom", "loomd", { spec: { selector: { app: "loomd" }, ports: [{ port: 7800 }] } }),
  obj("Service", "loom", "loom-worker", { spec: { selector: { app: "loom-worker" }, ports: [{ port: 7801 }] } }),
  obj("Service", "loom", "postgres", { spec: { selector: { app: "postgres" }, ports: [{ port: 5432 }] } }),
  obj("Service", "loom", "external-db", { spec: { ports: [{ port: 5432 }] } }),
  obj("NetworkPolicy", "loom", "default-deny-ingress", { spec: { podSelector: {}, policyTypes: ["Ingress"] } }),
  obj("NetworkPolicy", "loom", "postgres-from-loom", { spec: { podSelector: { matchLabels: { app: "postgres" } }, policyTypes: ["Ingress"],
    ingress: [{ from: [{ podSelector: { matchExpressions: [{ key: "app", operator: "In", values: ["loomd", "loom-worker"] }] } }], ports: [{ port: 5432 }] }] } }),
  obj("StatefulSet", "openshell", "openshell", { spec: { replicas: 1, ...tpl({ app: "openshell" }, [{ name: "gw" }]) }, status: { readyReplicas: 1 } }),
  pod("openshell", "openshell-0", ["StatefulSet", "openshell"], { app: "openshell" }),
  obj("Service", "openshell", "openshell", { spec: { selector: { app: "openshell" }, ports: [{ port: 8080 }] } }),
  obj("Service", "openshell", "openshell-peer", { spec: { selector: { app: "openshell" }, clusterIP: "None" } }),
  obj("Sandbox", "openshell", "sb-1", { apiVersion: "agents.x-k8s.io/v1beta1" }),
  pod("openshell", "sb-1-work", ["Sandbox", "sb-1"], { "openshell.ai/boundary-role": "workload" }),
  pod("openshell", "os-supervisor-1", ["Sandbox", "sb-1"], { "openshell.ai/managed-by": "openshell" }, supC),
  obj("Deployment", "kube-system", "coredns", { spec: { replicas: 1, ...tpl({ k8s: "dns" }, [{ name: "dns" }]) }, status: { readyReplicas: 1 } }),
  obj("Service", "default", "kubernetes", { spec: { ports: [{ port: 443 }] } }),
];
const graph = buildGraph(items);
const node = (name, kind) => graph.nodes.find(n => n.name === name && (!kind || n.kind === kind));
const edgeList = (edges) => edges.map(e => `${e.from.split("/")[2]}>${e.to.split("/")[2]}:${[...e.kinds].sort().join("+")}`).sort();

describe("kubernetes model", () => {
  test("groups pods under their top owner, including custom resources", () => {
    expect(node("loomd").pods.map(p => p.metadata.name)).toEqual(["loomd-abc-1"]);
    expect(node("sb-1", "Sandbox").pods.length).toBe(2);
    expect(graph.nodes.some(n => n.kind === "ReplicaSet" || n.kind === "Pod")).toBe(false);
    expect(node("postgres").pvcs.map(p => p.metadata.name)).toEqual(["data-postgres-0"]);
  });

  test("folds services into the workloads they select and keeps selectorless ones on their own", () => {
    expect(node("openshell", "StatefulSet").services.map(s => s.metadata.name)).toEqual(["openshell", "openshell-peer"]);
    expect(node("external-db", "Service")).toBeTruthy();
    expect(graph.nodes.some(n => n.name === "kubernetes")).toBe(false);
  });

  test("connects workloads through env, config maps, controllers and network policies", () => {
    expect(edgeList(graph.edges)).toEqual([
      "loom-worker>openshell:calls", "loom-worker>postgres:allowed", "loomd>loom-worker:calls", "loomd>postgres:allowed",
      "openshell>sb-1:manages", "sb-1>openshell:calls",
    ]);
    const viaConfig = graph.edges.find(e => e.from.endsWith("/loom-worker") && e.to.endsWith("/openshell"));
    expect([...viaConfig.via]).toEqual(["OPENSHELL_GATEWAY_URL"]);
    expect([...viaConfig.ports]).toEqual(["8080"]);
  });

  test("records ingress isolation from network policies", () => {
    expect(node("loomd").isolated).toBe(true);
    expect(node("postgres").policies.sort()).toEqual(["default-deny-ingress", "postgres-from-loom"]);
    expect(node("openshell", "StatefulSet").isolated).toBe(false);
  });

  test("hides system namespaces unless asked and filters by namespace", () => {
    expect(visibleGraph(graph, {}).nodes.some(n => n.ns === "kube-system")).toBe(false);
    expect(visibleGraph(graph, { showSystem: true }).nodes.some(n => n.ns === "kube-system")).toBe(true);
    const loomOnly = visibleGraph(graph, { hidden: new Set(["openshell"]) });
    expect(loomOnly.nodes.every(n => n.ns === "loom")).toBe(true);
    expect(loomOnly.edges.every(e => !e.to.includes("/openshell/"))).toBe(true);
  });

  test("lays callers left of what they call, one band per namespace, breaking cycles", () => {
    const v = visibleGraph(graph, {});
    const l = layoutGraph(v.nodes, v.edges);
    const r = (name, kind) => l.pos.get(node(name, kind).id).rank;
    expect(r("loomd")).toBeLessThan(r("loom-worker"));
    expect(r("loom-worker")).toBeLessThan(r("openshell", "StatefulSet"));
    expect(r("openshell", "StatefulSet")).toBeLessThan(r("sb-1"));
    expect(l.back.size).toBe(1);
    expect(l.bands.map(b => b.ns)).toEqual(["loom", "openshell"]);
    const loomBand = l.bands[0];
    for (const n of v.nodes.filter(n => n.ns === "openshell")) expect(l.pos.get(n.id).y).toBeGreaterThan(loomBand.y + loomBand.h);
    const cells = [...l.pos.values()].map(p => `${p.x},${p.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  test("health reads readiness, restarts and stuck containers", () => {
    expect(health(node("loomd")).state).toBe("ok");
    const crash = buildGraph([
      obj("Deployment", "a", "web", { spec: { replicas: 2, ...tpl({ app: "web" }, []) }, status: { readyReplicas: 1 } }),
      pod("a", "web-1", ["Deployment", "web"], { app: "web" }),
      pod("a", "web-2", ["Deployment", "web"], { app: "web" }, undefined, { phase: "Running", containerStatuses: [{ name: "c", ready: false, restartCount: 7, state: { waiting: { reason: "CrashLoopBackOff" } } }] }),
    ]).nodes[0];
    expect(health(crash)).toMatchObject({ state: "failing", ready: 1, desired: 2, restarts: 7, reason: "CrashLoopBackOff" });
    const rolling = buildGraph([obj("Deployment", "a", "web", { spec: { replicas: 2, ...tpl({}, []) }, status: { readyReplicas: 1 } })]).nodes[0];
    expect(health(rolling).state).toBe("degraded");
    const scaled = buildGraph([obj("Deployment", "a", "web", { spec: { replicas: 0, ...tpl({}, []) } })]).nodes[0];
    expect(health(scaled).state).toBe("idle");
  });

  test("finds service hosts in connection strings", () => {
    const hosts = (v) => hostsIn(v).map(h => h.host + (h.port ? ":" + h.port : "")).sort();
    expect(hosts("postgres://loom:secret@postgres:5432/loom")).toEqual(["postgres:5432"]);
    expect(hosts("redis.cache.svc.cluster.local")).toEqual(["redis.cache.svc.cluster.local"]);
    expect(hosts("--upstream=api:8080,backup:9090")).toEqual(["api:8080", "backup:9090"]);
    expect(hosts("0.0.0.0:7800 localhost:3000 just words")).toEqual([]);
  });

  test("query matches names, kinds, namespaces, images and status", () => {
    const pg = node("postgres");
    expect(matchesQuery(pg, "post")).toBe(true);
    expect(matchesQuery(pg, "kind:statefulset ns:loom")).toBe(true);
    expect(matchesQuery(pg, "kind:deploy")).toBe(false);
    expect(matchesQuery(pg, "is:ok -worker")).toBe(true);
    expect(matchesQuery(pg, "is:failing")).toBe(false);
  });
});
