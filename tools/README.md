<#
  README — verification tools

  These are development tools. They are not shipped in the product bundle and
  nothing in `src/` depends on them.

  ## build-app.ps1

  Builds the complete desktop application on Windows and reports where the
  installer landed.

      .\tools\build-app.ps1
      .\tools\build-app.ps1 -SkipFrontend      # re-bundle without rebuilding dist/

  This machine's MSVC C++ toolchain is installed but is not on `PATH` and is not
  registered with the Rust toolchain, so a plain `cargo` or `npx tauri build`
  fails with `linker 'link.exe' not found`. This script sets the developer
  environment (`PATH`, `INCLUDE`, `LIB`) in the current process before running
  the chain, which is the only way the Tauri CLI's child `cargo` process sees it.

  Use this instead of calling `cargo` or `tauri build` directly.

  ## cargo-dev.ps1

  Runs a single `cargo` command with the same developer environment.

      .\tools\cargo-dev.ps1 check --all-targets
      .\tools\cargo-dev.ps1 test --test store_integration

  ## screenshot.ps1

  Captures the app to a PNG.

      .\tools\screenshot.ps1
      .\tools\screenshot.ps1 -Out 'D:\selfimpulse-shots\app.png'

  This is the verification path for UI work, and it is deliberately the one
  that tells the truth.

  **Do not verify the UI with `PrintWindow`.** `PrintWindow` reads a window's
  own device context, but the Tauri webview is a separate composited layer
  owned by WebView2. `PrintWindow` silently omits it: during development it
  reported a window with no window controls and no top-bar actions while the
  running app had all of them. A capture that omits a layer looks exactly like
  a capture of a broken UI, so it produces confident false negatives.

  Instead this launches the app with a WebView2 remote-debugging port, attaches
  to the page over the DevTools protocol, and calls `Page.captureScreenshot`,
  which captures the real composited frame. The same channel can evaluate
  expressions in the running app, which is the only reliable way to answer
  "what does the DOM actually contain" — the DOM query that revealed the
  controls were present, correctly positioned and correctly coloured while the
  capture said otherwise.

      .\tools\screenshot.ps1 -Eval 'document.querySelectorAll(".winctl-btns button").length'

  A byte count proves the file was written; only reading the PNG proves what
  was on screen.
#>
