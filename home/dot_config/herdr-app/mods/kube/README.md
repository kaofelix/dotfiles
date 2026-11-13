# Kubernetes

A read-only view of the cluster behind the focused project: an architecture map and a list of its workloads, with their health and details.

- **Opening it:** `tabs-flat` shows a **Kube** button when the focused folder, or a parent below its git root, has one of these:
  `deploy/k8s`, `k8s`, `kubernetes`, `manifests`, `charts`, `helm`, `kustomization.yaml`, `Chart.yaml`, `skaffold.yaml`, `Tiltfile`, `kind.yaml` or `kind-config.yaml`.
  `cmd-shift-k` (`tabs-flat.kube`) toggles the pane in any folder.
- **Props:** `{ repo?, on?, context?, select?, view? }`. Without `context`, the pane uses kubectl's current context; the header switches context.
  `select` opens a workload by name, and `view: "list"` starts in the list.
- **Map:**
  - Each namespace is a band.
  - Each workload is a box: Deployment, StatefulSet, DaemonSet, CronJob, a bare Job or ReplicaSet, or any custom resource that owns pods, such as Agent Sandbox's `Sandbox`.
  - The box shows ready/desired, the ports of the Services that select it, volumes, restarts, or the failure reason.
  - The dot shows health: green ok, yellow degraded, red failing, grey scaled to zero. The shield means a network policy isolates its ingress.
- **Edges:**
  - **Calls** (solid accent): an env value, a config-map value or an argument names a Service (`http://loom-worker:7801`, `x.ns.svc.cluster.local`).
  - **Manages** (solid purple): a pod is labelled `managed-by=<workload>`.
  - **Routes**: an Ingress points at the Service.
  - **Allowed** (dashed): a NetworkPolicy lets a peer in.
  - Callers sit to the left of what they call. Edges that would close a cycle run under the boxes. Selecting a box highlights its edges and fades the rest.
- **List:** workloads grouped by namespace, showing image, ready, restarts and age. Expand a row to see its pods; each pod has a shell button.
- **Details:**
  - status chips, then Logs, Shell and Describe, each opened in a pane below. The pane stays open until you close it, even when kubectl fails:
    - **Logs:** `kubectl logs -f` for every pod.
    - **Describe:** paged in `less` (`q` closes it).
    - **Shell:** `bash`, else `sh`. If the pod was replaced, it picks a running pod from the workload.
      For images without a shell (distroless: the OpenShell gateway, sandbox supervisors), it offers `kubectl debug` with a busybox container, and asks first.
  - connections both ways (click one to follow it), pods, services
  - each container: image, ports, command, resources, env (secret values are shown only as their reference), mounts
  - volumes, network policies, conditions, labels, recent events
- **Filter:** free text, `ns:`, `kind:` (`deploy`, `sts`, `ds`, `svc`), `is:ok|degraded|failing|idle|isolated`, `image:`, `label=value`, and `-` to negate.
  The namespace chips hide namespaces. `+ system` shows kube-system and the other system namespaces.
- **Commands:** `kube.logs`, `kube.shell`, `kube.describe` and `kube.reload` act on the selected workload (from keys.json or `herdr-app do`).
- **Keys:** `j`/`k` move, `enter` opens, `v` switches map/list, `/` filters, `l` logs, `s` shell, `d` describe, `c` copies the name, `.` toggles system namespaces, `r` reloads.

The pane polls one `kubectl get <kinds> -A -o json` every 5 s, and redraws only when the output changes.
Kinds owned by custom resources are added to that call once they're seen. Events are fetched only for the open workload.
If the app's PATH lacks `kubectl`, it is found through the mise/asdf shims, `~/.local/bin` or Homebrew.
The graph logic lives in `model.js` (`tests/herdr-kube.test.ts`).
