# Platform Quality: Performance, Accessibility, Security, Observability, UI Material

## Performance

- Profile with Instruments before and after non-trivial changes.
- Keep main-thread work small; move heavy I/O/serialization off main actor.
- Add points of interest/log markers for repeatable profiling.
- Monitor production regressions with MetricKit where available.

## Accessibility

- Add semantic labels/traits/hints to custom controls.
- Validate VoiceOver flow for new/changed screens.
- Preserve contrast and dynamic type behavior for all UI states.

## Security and privacy

- Store secrets/tokens in Keychain (never in plaintext storage).
- Prefer CryptoKit for app-side crypto operations.
- Keep ATS enabled unless a justified exception is required.
- Update privacy manifests and required-reason API declarations when SDKs/data use changes.
- Reconcile App Store privacy answers with real runtime behavior.

## Observability

- Use `Logger`/OSLog with subsystem + category taxonomy.
- Avoid sensitive payloads in logs.
- Use crash + hang telemetry from Apple tooling and/or approved third-party SDKs.

## Liquid Glass and translucent design

- Use native Liquid Glass APIs on supported OS versions.
- Treat glass effects as hierarchy/focus tools, not decoration.
- Gate with availability checks and provide sensible fallback UI.
- Validate readability/contrast on busy backgrounds and accessibility settings.

## Red flags

- Performance claims without profiling evidence.
- New SDKs added without privacy/security impact review.
- Decorative translucency reducing legibility.
