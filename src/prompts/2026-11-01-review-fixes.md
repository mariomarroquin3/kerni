# Review fixes: memory, process close, temp folders, Windows startup, bin, network, UI

## Request

Apply the pending review findings to the Kerni repo with tests, as small local commits, without pushing. Backend first (reflections, timestamps, Safe Browsing privacy, Host header), then Rust (pid reuse on close, temp folders, Linux HOME fallback, 32-bit startup entries, bin revalidation, multicast filter), then the window (fetch timeouts, panic list). Items that need a decision were reported and not changed: reflections saved without approval, moving the backend to the cloud or a sidecar, CI on push, clippy and audit, splitting `main.js` and `sistema.rs`, and the XP / evolution / clipboard / freeze features.

## Decisions

- Reflections: the 200 cap removes the lowest-scored rows, including the new one when it is the worst (the result then says `descartada`). Forgotten reflections block any content with Jaccard >= 0.6 against their tokens, also on `reemplazarReflexion`.
- `vaciarReflexiones` now writes tombstones for everything it clears. Otherwise the extractor would relearn the same facts from the next messages and "borrar todo" would not hold. `olvidarTodo` still clears tombstones.
- Health windows and the episode expiry compare ISO text with cutoffs computed in JS (`desdeHace`), the same format `creado` is stored in. Message retention still uses `datetime('now')` because `mensajes.creado` is stored that way.
- Safe Browsing gets only scheme, host and path: no user, password, query or fragment.
- Host header: with a known port (production) it must be `127.0.0.1:<port>` or `localhost:<port>`; without one (tests and `inject`) the host name alone is checked. The front already calls `127.0.0.1:8788`.
- Closing a process: the process list carries `inicio` (start time) and the front sends it back. If it is missing (a proposal from the model does not carry it), only the name is checked. This gap remains and is recorded in the commit message.
- Temp folders: a directory is removed only if its own modification time, read before it is emptied, is older than the limit. Linux: `XDG_CACHE_HOME` if absolute, else `$HOME/.cache`, else refuse. The Linux helpers are compiled under `test` too, so their tests run on Windows.
- Startup entries: the WOW6432Node `Run` entry reads its switch from `StartupApproved\Run32`.
- Bin: the card sends the measured elements and MB back; Rust refuses if the bin has more than twice the elements or 50 MB more than approved. With no approved figures the old behavior stays. The backend schema has no count fields, so the model cannot set them.
- Network list: entries with a first octet of 224 or more are dropped. `192.168.1.255` (a subnet broadcast) is not dropped; the rule only covers the ranges named in the review.
- Window: every backend call except `/chat` (which keeps its 60 s deadline) has `AbortSignal.timeout(15 s)`. The panic list keeps its rows while the pids are unchanged.

## Verification

- Backend: `npm test` passes (321 tests). New tests cover the cap, look-alike tombstones, `vaciarReflexiones` tombstones, the abort signal reaching the provider, the 24 h health window, the Safe Browsing URL, the Host check and the model's count fields in `vaciar_papelera`.
- Desktop: `npm test` passes (108). New wiring tests check the process `inicio`, the bin figures, the fetch timeouts and the panic list guard.
- Rust: `cargo test` passes (42 tests, 3 ignored). New tests cover the process start time (with a real process on Windows), temp folder age, the Linux HOME fallback, the Run32 mapping, the bin rule and the multicast filter. The Linux target is not installed here, so the Linux-only code paths are checked by reading only.
- Commits are local only; nothing was pushed.
