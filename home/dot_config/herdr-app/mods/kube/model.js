// Pure Kubernetes logic: turns `kubectl get … -o json` items into an architecture graph (workloads with
// their pods, services and volumes; edges from config, controllers and network policies), its health, the filter
// language and a layered layout. No herdr imports, so tests load it directly.

export const SYSTEM_NAMESPACES = new Set(["kube-system", "kube-public", "kube-node-lease", "local-path-storage"]);
const WORKLOAD = new Set(["Deployment", "StatefulSet", "DaemonSet", "CronJob"]);
// Kinds that are never a box of their own.
const SUPPORT = new Set(["Namespace", "Node", "Event", "ConfigMap", "Secret", "PersistentVolumeClaim", "PersistentVolume", "Service",
  "Endpoints", "EndpointSlice", "NetworkPolicy", "HorizontalPodAutoscaler", "ReplicaSet", "Job", "Pod", "Ingress", "ServiceAccount",
  "Role", "RoleBinding", "ControllerRevision", "PodDisruptionBudget", "Lease"]);
const BAD_REASONS = new Set(["CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull", "CreateContainerConfigError", "CreateContainerError",
  "InvalidImageName", "RunContainerError", "OOMKilled", "Error"]);

export const KIND_ALIASES = { deploy: "deployment", sts: "statefulset", ds: "daemonset", svc: "service", cj: "cronjob", ing: "ingress", po: "pod" };
export const SHORT_KIND = { Deployment: "deploy", StatefulSet: "sts", DaemonSet: "ds", CronJob: "cronjob", Job: "job", Service: "svc",
  Ingress: "ingress", Pod: "pod", ReplicaSet: "rs" };

const key = (kind, ns, name) => kind + "/" + (ns ?? "") + "/" + name;
const keyOf = (o) => key(o.kind, o.metadata?.namespace, o.metadata?.name);
const controllerRef = (o) => (o.metadata?.ownerReferences ?? []).find(r => r.controller) ?? o.metadata?.ownerReferences?.[0];

export function selects(selector, labels = {}) {
  if (!selector) return false;
  for (const [k, v] of Object.entries(selector.matchLabels ?? {})) if (labels[k] !== v) return false;
  for (const e of selector.matchExpressions ?? []) {
    const has = Object.hasOwn(labels, e.key), v = labels[e.key];
    if (e.operator === "In" && !(has && e.values.includes(v))) return false;
    if (e.operator === "NotIn" && has && e.values.includes(v)) return false;
    if (e.operator === "Exists" && !has) return false;
    if (e.operator === "DoesNotExist" && has) return false;
  }
  return true;
}
// A Service's selector is a plain map.
const selectsMap = (map, labels = {}) => Boolean(map) && Object.keys(map).length > 0 && Object.entries(map).every(([k, v]) => labels[k] === v);

function podTemplate(o) {
  if (o.kind === "CronJob") return o.spec?.jobTemplate?.spec?.template;
  return o.spec?.template ?? o.spec?.podTemplate;
}

// Host names (with ports) a config value points at: URLs, host:port pairs and cluster DNS names.
export function hostsIn(value) {
  const s = String(value ?? ""), out = [], seen = new Set();
  const re = /[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*/gi;
  for (let m; (m = re.exec(s));) {
    const start = m.index, end = start + m[0].length;
    const before = s[start - 1], after = s[end];
    if (before && /[A-Za-z0-9._-]/.test(before)) continue;
    if (after && /[A-Za-z0-9_-]/.test(after)) continue;
    const host = m[0].toLowerCase().replace(/\.$/, "");
    const rest = s.slice(end);
    if (/^:[^@/\s]*@/.test(rest)) continue; // user:password@ — not a host
    const port = /^:(\d{1,5})(?![\d])/.exec(rest)?.[1] ?? null;
    if (/^[\d.]+$/.test(host) || host === "localhost") { if (port) re.lastIndex = end + 1 + port.length; continue; }
    const url = s.slice(Math.max(0, start - 3), start) === "://" || before === "@";
    if (!port && !url && !/\.svc(\.|$)/.test(host)) continue;
    const id = host + ":" + (port ?? "");
    if (!seen.has(id)) { seen.add(id); out.push({ host, port }); }
    if (port) re.lastIndex = end + 1 + port.length;
  }
  return out;
}

export function buildGraph(items) {
  const byKey = new Map(items.map(o => [keyOf(o), o]));
  const nodes = new Map();
  const nodeFor = (kind, ns, name, obj) => {
    const id = key(kind, ns, name);
    if (!nodes.has(id)) nodes.set(id, { id, kind, ns: ns ?? "", name, obj: obj ?? null, pods: [], services: [], pvcs: [], policies: [], ingresses: [], hpas: [], isolated: false, apiVersion: obj?.apiVersion });
    else if (obj && !nodes.get(id).obj) nodes.get(id).obj = obj;
    return nodes.get(id);
  };
  // The object a pod (or a ReplicaSet, Job) ultimately belongs to.
  const top = (o) => {
    let cur = o;
    for (let i = 0; i < 8; i++) {
      const ref = controllerRef(cur);
      if (!ref) break;
      const ns = cur.metadata?.namespace, owner = byKey.get(key(ref.kind, ns, ref.name));
      if (!owner) {
        if (ref.kind === "ReplicaSet" || ref.kind === "Job") break;
        return { kind: ref.kind, ns, name: ref.name, obj: null };
      }
      cur = owner;
    }
    return { kind: cur.kind, ns: cur.metadata?.namespace, name: cur.metadata?.name, obj: cur };
  };

  for (const o of items) {
    if (WORKLOAD.has(o.kind) || (!SUPPORT.has(o.kind) && o.metadata?.namespace)) nodeFor(o.kind, o.metadata.namespace, o.metadata.name, o);
  }
  const podsByNs = new Map();
  for (const p of items.filter(o => o.kind === "Pod")) {
    const t = top(p);
    nodeFor(t.kind, t.ns, t.name, t.obj).pods.push(p);
    const ns = p.metadata.namespace;
    if (!podsByNs.has(ns)) podsByNs.set(ns, []);
    podsByNs.get(ns).push(p);
  }
  for (const o of items) if ((o.kind === "Job" || o.kind === "ReplicaSet") && !controllerRef(o) && o.spec?.replicas !== 0) nodeFor(o.kind, o.metadata.namespace, o.metadata.name, o);

  const podNode = new Map();
  for (const n of nodes.values()) for (const p of n.pods) podNode.set(keyOf(p), n);
  const labelsOf = (n) => {
    const sets = n.pods.map(p => p.metadata.labels ?? {});
    const t = n.obj && podTemplate(n.obj)?.metadata?.labels;
    if (t) sets.push(t);
    return sets;
  };
  const nodesIn = (ns) => [...nodes.values()].filter(n => n.ns === ns);

  // Services: folded into what they select; selectorless or orphaned ones stand alone.
  const svcTarget = new Map();
  for (const s of items.filter(o => o.kind === "Service")) {
    const ns = s.metadata.namespace, name = s.metadata.name;
    if (ns === "default" && name === "kubernetes") continue;
    const sel = s.spec?.selector;
    let targets = [];
    if (sel && Object.keys(sel).length) targets = nodesIn(ns).filter(n => labelsOf(n).some(l => selectsMap(sel, l)));
    if (!targets.length) targets = [nodeFor("Service", ns, name, s)];
    else for (const t of targets) t.services.push(s);
    svcTarget.set(ns + "/" + name, targets[0]);
  }

  // Volumes.
  const pvcs = new Map(items.filter(o => o.kind === "PersistentVolumeClaim").map(o => [o.metadata.namespace + "/" + o.metadata.name, o]));
  for (const n of nodes.values()) {
    const claims = new Set();
    for (const p of n.pods) for (const v of p.spec?.volumes ?? []) if (v.persistentVolumeClaim) claims.add(v.persistentVolumeClaim.claimName);
    for (const v of (n.obj && podTemplate(n.obj)?.spec?.volumes) ?? []) if (v.persistentVolumeClaim) claims.add(v.persistentVolumeClaim.claimName);
    if (n.kind === "StatefulSet") for (const t of n.obj?.spec?.volumeClaimTemplates ?? [])
      for (const [k] of pvcs) if (k.startsWith(n.ns + "/" + t.metadata.name + "-" + n.name + "-")) claims.add(k.split("/")[1]);
    n.pvcs = [...claims].sort().map(c => pvcs.get(n.ns + "/" + c) ?? { kind: "PersistentVolumeClaim", metadata: { name: c, namespace: n.ns }, status: { phase: "Missing" } });
  }

  const edges = new Map();
  const edge = (from, to, kind, { via, port } = {}) => {
    if (!from || !to || from === to) return;
    const k = from.id + "|" + to.id;
    if (!edges.has(k)) edges.set(k, { key: k, from: from.id, to: to.id, kinds: new Set(), via: new Set(), ports: new Set() });
    const e = edges.get(k);
    e.kinds.add(kind);
    if (via) e.via.add(via);
    if (port) e.ports.add(String(port));
  };

  // Calls: env values, config map values and args that name a Service.
  const configMaps = new Map(items.filter(o => o.kind === "ConfigMap").map(o => [o.metadata.namespace + "/" + o.metadata.name, o]));
  const resolve = (host, ns) => {
    const parts = host.split(".");
    if (parts.length === 1) return svcTarget.get(ns + "/" + parts[0]);
    if (parts.length === 2 || parts[2] === "svc") return svcTarget.get(parts[1] + "/" + parts[0]);
    return null;
  };
  for (const n of nodes.values()) {
    const containers = [];
    const spec = n.obj && podTemplate(n.obj)?.spec;
    if (spec) containers.push(...(spec.containers ?? []), ...(spec.initContainers ?? []));
    else for (const p of n.pods) containers.push(...(p.spec?.containers ?? []), ...(p.spec?.initContainers ?? []));
    n.containers = containers;
    const values = [];
    for (const c of containers) {
      for (const e of c.env ?? []) {
        if (e.value) values.push([e.name, e.value]);
        const ref = e.valueFrom?.configMapKeyRef;
        if (ref) { const v = configMaps.get(n.ns + "/" + ref.name)?.data?.[ref.key]; if (v) values.push([e.name, v]); }
      }
      for (const f of c.envFrom ?? []) if (f.configMapRef) for (const [k, v] of Object.entries(configMaps.get(n.ns + "/" + f.configMapRef.name)?.data ?? {})) values.push([(f.prefix ?? "") + k, v]);
      for (const a of [...(c.command ?? []), ...(c.args ?? [])]) values.push(["args", a]);
    }
    for (const [via, v] of values) for (const h of hostsIn(v)) edge(n, resolve(h.host, n.ns), "calls", { via, port: h.port });
  }

  // Controllers: a pod labelled managed-by=<name of another workload>.
  for (const n of nodes.values()) {
    for (const l of labelsOf(n).concat([n.obj?.metadata?.labels ?? {}])) for (const [k, v] of Object.entries(l)) {
      if (!/(^|\/)managed-by$/.test(k)) continue;
      const m = nodesIn(n.ns).find(o => o.name === v && o !== n && WORKLOAD.has(o.kind));
      if (m) edge(m, n, "manages");
    }
  }

  // Network policies: who they isolate and which peers they let in.
  for (const np of items.filter(o => o.kind === "NetworkPolicy")) {
    const ns = np.metadata.namespace, spec = np.spec ?? {};
    const types = spec.policyTypes ?? (spec.egress ? ["Ingress", "Egress"] : ["Ingress"]);
    const targets = nodesIn(ns).filter(n => n.kind !== "Service" && labelsOf(n).some(l => selects(spec.podSelector ?? {}, l)));
    for (const t of targets) { t.policies.push(np.metadata.name); if (types.includes("Ingress")) t.isolated = true; }
    for (const rule of spec.ingress ?? []) for (const from of rule.from ?? []) {
      if (!from.podSelector) continue;
      let peerNs = [ns];
      if (from.namespaceSelector) {
        const name = from.namespaceSelector.matchLabels?.["kubernetes.io/metadata.name"];
        peerNs = name ? [name] : [];
      }
      const port = (rule.ports ?? []).map(p => p.port).filter(Boolean).join(",");
      for (const pn of peerNs) for (const src of nodesIn(pn).filter(n => labelsOf(n).some(l => selects(from.podSelector, l))))
        for (const t of targets) edge(src, t, "allowed", { via: np.metadata.name, port });
    }
  }

  // Ingresses route to services.
  for (const ing of items.filter(o => o.kind === "Ingress")) {
    const n = nodeFor("Ingress", ing.metadata.namespace, ing.metadata.name, ing);
    const backends = [ing.spec?.defaultBackend, ...(ing.spec?.rules ?? []).flatMap(r => (r.http?.paths ?? []).map(p => p.backend))].filter(Boolean);
    for (const b of backends) if (b.service) edge(n, svcTarget.get(n.ns + "/" + b.service.name), "routes", { port: b.service.port?.number ?? b.service.port?.name });
  }
  for (const h of items.filter(o => o.kind === "HorizontalPodAutoscaler")) {
    const r = h.spec?.scaleTargetRef; const n = r && nodes.get(key(r.kind, h.metadata.namespace, r.name));
    if (n) n.hpas.push(h);
  }

  const list = [...nodes.values()].sort((a, b) => a.ns.localeCompare(b.ns) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  const namespaces = items.filter(o => o.kind === "Namespace").map(o => o.metadata.name);
  for (const n of list) if (!namespaces.includes(n.ns)) namespaces.push(n.ns);
  return { nodes: list, edges: [...edges.values()], namespaces: [...new Set(namespaces)].sort(), byId: nodes };
}

const podReady = (p) => (p.status?.conditions ?? []).some(c => c.type === "Ready" && c.status === "True") || (p.status?.phase === "Succeeded");

export function health(n) {
  const o = n.obj ?? {}, st = o.status ?? {};
  let reason = null, restarts = 0;
  for (const p of n.pods) for (const c of [...(p.status?.initContainerStatuses ?? []), ...(p.status?.containerStatuses ?? [])]) {
    restarts += c.restartCount ?? 0;
    const r = c.state?.waiting?.reason ?? c.state?.terminated?.reason;
    if (r && BAD_REASONS.has(r) && !reason) reason = r;
  }
  if (!reason) for (const p of n.pods) if (p.status?.phase === "Failed") { reason = p.status.reason ?? "Failed"; break; }
  if (!reason) for (const p of n.pods) if (p.status?.phase === "Pending") { const c = (p.status.conditions ?? []).find(c => c.status === "False" && c.reason); if (c?.reason === "Unschedulable") reason = "Unschedulable"; }
  let desired, ready;
  if (n.kind === "Service" || n.kind === "Ingress") return { state: "ok", ready: null, desired: null, restarts: 0, reason: null };
  if (n.kind === "DaemonSet") { desired = st.desiredNumberScheduled ?? n.pods.length; ready = st.numberReady ?? n.pods.filter(podReady).length; }
  else if (n.kind === "CronJob") { desired = null; ready = null; }
  else if (n.kind === "Job") {
    const failing = (st.failed ?? 0) > 0 && !st.succeeded;
    return { state: failing ? "failing" : st.active ? "degraded" : "ok", ready: st.succeeded ?? 0, desired: o.spec?.completions ?? 1, restarts, reason: failing ? reason ?? "Failed" : reason };
  } else {
    desired = typeof o.spec?.replicas === "number" ? o.spec.replicas : n.pods.length;
    ready = typeof st.readyReplicas === "number" ? st.readyReplicas : (st.readyReplicas === undefined && WORKLOAD.has(n.kind) ? 0 : n.pods.filter(podReady).length);
    if (WORKLOAD.has(n.kind) && st.readyReplicas === undefined && n.pods.length) ready = n.pods.filter(podReady).length;
  }
  let state = "ok";
  if (desired === 0) state = "idle";
  else if (reason) state = "failing";
  else if (desired != null && ready < desired) state = "degraded";
  return { state, ready, desired, restarts, reason };
}

export function images(n) {
  return [...new Set((n.containers ?? []).map(c => c.image).filter(Boolean))];
}

const lower = (v) => String(v ?? "").toLowerCase();

export function matchesQuery(n, query) {
  for (const raw of String(query ?? "").trim().split(/\s+/).filter(Boolean)) {
    const neg = raw.length > 1 && raw.startsWith("-"), tok = lower(neg ? raw.slice(1) : raw);
    let m, ok;
    if ((m = /^(?:ns|namespace):(.+)$/.exec(tok))) ok = lower(n.ns).includes(m[1]);
    else if ((m = /^(?:kind|k):(.+)$/.exec(tok))) ok = lower(n.kind).startsWith(KIND_ALIASES[m[1]] ?? m[1]);
    else if ((m = /^(?:is|status):(.+)$/.exec(tok))) ok = health(n).state === m[1] || (m[1] === "isolated" && n.isolated);
    else if ((m = /^image:(.+)$/.exec(tok))) ok = images(n).some(i => lower(i).includes(m[1]));
    else if ((m = /^([^=]+)=(.*)$/.exec(tok))) ok = [n.obj?.metadata?.labels ?? {}, ...n.pods.map(p => p.metadata.labels ?? {})].some(l => Object.entries(l).some(([k, v]) => lower(k) === m[1] && lower(v).includes(m[2])));
    else ok = lower(n.name).includes(tok) || lower(n.kind).includes(tok) || lower(n.ns).includes(tok) || images(n).some(i => lower(i).includes(tok))
      || n.services.some(s => lower(s.metadata.name).includes(tok));
    if (ok === neg) return false;
  }
  return true;
}

export function visibleGraph(graph, { showSystem = false, hidden = new Set(), query = "" } = {}) {
  const nodes = graph.nodes.filter(n => (showSystem || !SYSTEM_NAMESPACES.has(n.ns)) && !hidden.has(n.ns) && matchesQuery(n, query));
  const ids = new Set(nodes.map(n => n.id));
  return { nodes, edges: graph.edges.filter(e => ids.has(e.from) && ids.has(e.to)) };
}

const PRIORITY = { manages: 0, routes: 1, calls: 2, allowed: 3 };
const edgePriority = (e) => Math.min(...[...e.kinds].map(k => PRIORITY[k] ?? 9));

export const BOX = { w: 210, h: 58, colGap: 64, rowGap: 14, bandPad: 30, bandGap: 18, margin: 16 };

// Layered layout: callers to the left of what they call, one horizontal band per namespace, columns shared across
// bands so cross-namespace edges still run left to right. Edges that would close a cycle are drawn as back edges.
export function layoutGraph(nodes, edges, box = BOX) {
  const ids = new Set(nodes.map(n => n.id)), out = new Map(nodes.map(n => [n.id, []]));
  const back = new Set();
  const reaches = (from, to) => {
    const stack = [from], seen = new Set();
    while (stack.length) { const c = stack.pop(); if (c === to) return true; if (seen.has(c)) continue; seen.add(c); stack.push(...out.get(c)); }
    return false;
  };
  const sorted = edges.filter(e => ids.has(e.from) && ids.has(e.to)).sort((a, b) => edgePriority(a) - edgePriority(b) || a.key.localeCompare(b.key));
  const forward = [];
  for (const e of sorted) {
    if (reaches(e.to, e.from)) { back.add(e.key); continue; }
    out.get(e.from).push(e.to); forward.push(e);
  }
  const rank = new Map();
  const visit = (id, depth = 0) => {
    if (rank.has(id)) return rank.get(id);
    let r = 0;
    for (const e of forward) if (e.to === id && depth < 200) r = Math.max(r, visit(e.from, depth + 1) + 1);
    rank.set(id, r); return r;
  };
  for (const n of nodes) visit(n.id);

  const byNs = new Map();
  for (const n of nodes) { if (!byNs.has(n.ns)) byNs.set(n.ns, []); byNs.get(n.ns).push(n); }
  const nsOrder = [...byNs.keys()].sort((a, b) => Math.min(...byNs.get(a).map(n => rank.get(n.id))) - Math.min(...byNs.get(b).map(n => rank.get(n.id))) || a.localeCompare(b));

  // Order within each (namespace, rank) cell by the average slot of their neighbours, a couple of sweeps.
  const cells = new Map();
  for (const ns of nsOrder) for (const n of byNs.get(ns).sort((a, b) => a.name.localeCompare(b.name))) {
    const k = ns + "|" + rank.get(n.id);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(n.id);
  }
  const slot = () => { const m = new Map(); for (const list of cells.values()) list.forEach((id, i) => m.set(id, i)); return m; };
  for (let sweep = 0; sweep < 3; sweep++) {
    const s = slot();
    for (const list of cells.values()) {
      const bary = new Map(list.map(id => {
        const nb = forward.filter(e => e.to === id).map(e => s.get(e.from)).concat(forward.filter(e => e.from === id).map(e => s.get(e.to)));
        return [id, nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : s.get(id)];
      }));
      list.sort((a, b) => bary.get(a) - bary.get(b));
    }
  }

  const pos = new Map(), bands = [];
  let y = box.margin;
  const maxRank = Math.max(0, ...rank.values());
  for (const ns of nsOrder) {
    let rows = 1;
    for (let r = 0; r <= maxRank; r++) rows = Math.max(rows, cells.get(ns + "|" + r)?.length ?? 0);
    const h = box.bandPad + rows * box.h + (rows - 1) * box.rowGap + 12;
    bands.push({ ns, y, h });
    for (let r = 0; r <= maxRank; r++) (cells.get(ns + "|" + r) ?? []).forEach((id, i) => pos.set(id, {
      rank: r, x: box.margin + 8 + r * (box.w + box.colGap), y: y + box.bandPad + i * (box.h + box.rowGap), w: box.w, h: box.h,
    }));
    y += h + box.bandGap;
  }
  const width = box.margin * 2 + 16 + (maxRank + 1) * box.w + maxRank * box.colGap;
  return { pos, bands, back, width, height: Math.max(y - box.bandGap + box.margin, 0) };
}

// "3m", "2h", "5d" since an ISO time.
export function age(iso, now = Date.now()) {
  const t = Date.parse(iso ?? "");
  if (!t) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return Math.floor(s) + "s";
  if (s < 5400) return Math.floor(s / 60) + "m";
  if (s < 172800) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
