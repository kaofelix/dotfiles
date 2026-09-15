# Services, Tasks, and Wake-Up

Read this reference for servers, bots, workers, webhooks, scheduled work, wake-up failures, or anything that must keep running.

## Lifecycle model

A Sprite has two idle stages:

- **Warm**: the VM is suspended, billing stops, and process memory is preserved. An inbound HTTP request resumes it.
- **Cold**: memory is dropped. Files and service definitions persist; Services restart on wake.

Choose the primitive by intent:

- **TTY session**: detachable interactive work; it does not provide cold-wake recovery.
- **Service**: process definition that survives lifecycle transitions—preserved through warm suspension and restarted after cold wake.
- **Task**: temporary hold that prevents the current Sprite run from pausing. It does not replace a Service.

For an HTTP app that may pause, register a Service with its HTTP port. For an agent actively doing work that must not stall, combine a Service with a Task heartbeat.

## Manage Services inside the Sprite

First inspect the installed command surface:

```bash
sprite exec -o <org> -s <sprite> -- sprite-env services --help
sprite exec -o <org> -s <sprite> -- sprite-env services create --help
```

Typical service:

```bash
sprite exec -o <org> -s <sprite> -- \
  sprite-env services create web \
  --cmd python \
  --args=-m,http.server,8080 \
  --dir /home/sprite/app \
  --http-port 8080 \
  --duration 10s
```

Manage and verify it:

```bash
sprite exec -o <org> -s <sprite> -- sprite-env services list
sprite exec -o <org> -s <sprite> -- sprite-env services get web
sprite exec -o <org> -s <sprite> -- sprite-env services restart web
sprite exec -o <org> -s <sprite> -- tail -100 /.sprite/logs/services/web.log
```

A service name is unique. If `create` reports a conflict, inspect the existing definition before replacing it. Use stop/delete/create when the installed helper cannot update a definition.

Only one service should own the public `http_port`. For a reverse proxy with backend services, declare dependencies so they start first:

```bash
sprite-env services create proxy \
  --cmd caddy \
  --args=run,--config,/home/sprite/Caddyfile \
  --needs=api,frontend \
  --http-port 8080
```

Completion criterion: `services get` reports `running`, the expected port is listening, and an internal and external HTTP probe reaches the app.

## Keep active work from pausing

Tasks are holds on the current run. The maximum expiry is one hour, so long work needs an expiring heartbeat. Prefer `PUT` because it creates or refreshes without a `409` name collision:

```bash
sprite-env curl -s -X PUT /v1/tasks/agent-work \
  -d '{"expire":"5m"}'

sprite-env curl -s /v1/tasks

sprite-env curl -s -X DELETE /v1/tasks/agent-work
```

A robust wrapper refreshes every minute, expires after five minutes, and releases on exit:

```bash
#!/usr/bin/env bash
set -euo pipefail

task=agent-work
cleanup() {
  kill "${heartbeat:-}" 2>/dev/null || true
  wait "${heartbeat:-}" 2>/dev/null || true
  sprite-env curl -s -X DELETE "/v1/tasks/$task" >/dev/null 2>&1 || true
}
trap cleanup EXIT

(
  while true; do
    sprite-env curl -s -X PUT "/v1/tasks/$task" \
      -d '{"expire":"5m"}' >/dev/null
    sleep 60
  done
) &
heartbeat=$!

/home/sprite/app/run-worker &
worker=$!
trap 'kill "$worker" 2>/dev/null || true' INT TERM
wait "$worker"
```

A live Task means compute remains active and may remain billable. Use it only while work must make progress.

## Wake-safe architecture

Inbound HTTP can wake a Sprite; an outbound-only connection cannot wake itself after the Sprite is cold. Therefore:

- HTTP webhooks and request-driven servers fit Sprite wake-up.
- Outbound WebSocket clients, polling bots, and cron inside the Sprite cannot initiate their own wake.
- Use an inbound HTTP adapter, an external scheduler/pinger, or another always-on platform for outbound-only workloads.
- Cron inside a paused Sprite runs only while the Sprite is already awake. Use an external scheduler or perform age-gated maintenance on service startup.

When a public reverse proxy fronts a private service, add the backend to `--needs`. Otherwise the request can wake the proxy before the backend is ready.

## Diagnose wake failures

Trace one request through every boundary:

1. `sprite info` or `sprite url`: correct URL and auth mode.
2. `sprite-env services list`: public service owns the expected `http_port`.
3. `sprite-env services get <name>`: service and dependencies are running.
4. `ss -ltnp`: expected process is listening.
5. Internal `curl localhost:<port>` succeeds.
6. External request reaches the Sprite URL.
7. Service and application logs show the same request.
8. `sprite-env curl -s /v1/tasks`: a Task exists only if pausing must be prevented.

Completion criterion: evidence identifies the exact boundary where the request or wake sequence stops.