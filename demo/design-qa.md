# StarryLink「決策矩陣 × 程式運行」視覺匹配 Design QA（2026-08-09）

## Current result

final result: passed

## Source truth and rendered evidence

- User-provided source reference: `/var/folders/2x/l0jqjrlj0tzdyy10bkn0x5d00000gn/T/codex-clipboard-ce808551-9c9e-49c6-9111-7c313fe78544.png`
- User-provided Runtime before reference: `/var/folders/2x/l0jqjrlj0tzdyy10bkn0x5d00000gn/T/codex-clipboard-23992d2c-57ff-4773-a9db-f5ad48ce3b21.png`
- Normalized source visual truth — settled Matrix: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/14-matrix-reference-1280x720.png`
- Final implementation — settled Runtime: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/13-runtime-final-1280x720.png`
- Full-view combined comparison: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/15-full-comparison-final-1280x720.png`
- Focused core comparison: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/16-focused-comparison-final-1280x720.png`
- Keyboard/drawer evidence: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/12-runtime-keyboard-drawer-1280x720.png`
- Mobile implementation evidence: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/11-runtime-390x844.png`
- Complete live-flow recording: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/video/runtime-matrix-aligned-complete-flow.mp4` (`1280 × 720`, 7.2 seconds, 5 fps)
- Recording contact sheet: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/video/runtime-matrix-aligned-contact-sheet.png`
- Source and implementation comparison captures are both `1280 × 720` pixels from a `1280 × 720` CSS viewport. The in-app browser returned CSS-pixel-normalized captures, so no density resampling was applied. The full comparison is `2560 × 720`; the focused comparison uses equal `1218 × 320` crops at native scale.
- State compared: Matrix settled at `RED 80 / 100`; Runtime settled with Satellite selected at `100 / 100`, packet `#9`, ACK missing, display risk `100`, retry `4`. These are intentionally different product states; the comparison target is their shared visual language, hierarchy, density, and interaction grammar rather than identical content.

## Findings

- No actionable P0, P1, or P2 finding remains.
- Runtime now uses the same two-part hierarchy as Matrix: a large structured list on the left and one dominant conclusion panel on the right. Seven horizontal micro-cards were replaced with readable process rows, without changing the underlying node IDs or Demo-state mapping.
- Candidate channels now occupy one full-width, subordinate evaluation layer, matching Matrix's bottom control layer. Unavailable channels remain subdued and text-labelled; only the selected route receives the violet selection treatment.
- The cinematic cockpit image, nested glass layers, radar ornament, excessive rounding, and repeated English micro-labels were removed from Runtime. The page now shares Matrix's flat near-black surface, thin dividers, restrained grid, square inner panels, and token-based semantic colors.
- The result panel now leads with the selected channel score, then path, reason, packet sequence, risk, ACK, delivery, retries, latency, and priority. It no longer lets technical evidence or pseudo-code compete with the conclusion.

## Required fidelity surfaces

- Fonts and typography: both pages use the existing `Chiron GoRound TC` / `Noto Sans TC` and `Space Grotesk` token stack. Runtime matches Matrix's `30–42 px` page-title scale, `12 px` section labels, `14 px` row titles, tabular score treatment, and restrained tracking. Short-height rules keep the 1280 × 720 narrative readable without truncating core values.
- Spacing and layout rhythm: both pages use the same 12-column `8 / 4` desktop split, `14 px` macro gap, `18–20 px` panel padding, thin row rhythm, and a full-width lower layer. Runtime's required five-field summary remains as an intentional page-specific band.
- Colors and visual tokens: backgrounds, borders, primary text, secondary text, star blue, space violet, safe mint, warning amber, and danger coral all map to existing global tokens. Only the selected route is highlighted; failure and ACK states remain understandable from visible text.
- Image quality and asset fidelity: the existing StarryLink raster logo is reused unchanged. The Matrix target contains no hero imagery, so Runtime's cockpit image was intentionally removed rather than replaced with generated art, inline SVG, CSS illustration, emoji, or placeholder assets.
- Copy and content: the required Runtime eyebrow remains bilingual; internal section labels were simplified to `訊號處理`, `傳輸結果`, and `通道評估`. Packet bytes, selected score, reason, path, packet sequence, risk, ACK, delivery, retries, and latency still come from the shared Runtime view model.

## Responsive, interaction, and accessibility evidence

- `1440 × 900` CSS viewport: document width equals viewport width; Runtime main and result end at `641.5 px`, channel evaluation at `792 px`, collapsed evidence at `834 px`, and persistent page controls at `888 px`. No horizontal overflow or core clipping.
- `1280 × 720`: screenshot evidence shows the complete narrative, channel evaluation, collapsed evidence bar, and page controls in one viewport. Document width equals `1280`; result fields remain complete and uncompressed.
- `390 × 844`: document width equals `390`, horizontal overflow is `false`, summary becomes two columns, process becomes a vertical sequence, result and channels stack, and technical evidence stays collapsed. The in-app screenshot surface captured the visible `390 × 800` portion of the `390 × 844` CSS viewport.
- Keyboard: `Enter` opens the technical-evidence drawer, Arrow keys and End move between tabs, `Enter` opens the full-algorithm drawer, and `Enter` starts replay. The replay button becomes disabled at `1 / 9` and re-enables at `9 / 9`.
- The complete replay was captured from the live browser across 37 time-based frames. Its contact sheet shows monotonic `1 / 9 → 9 / 9` progress and the final settled ACK/risk state.
- Open technical evidence is constrained to an in-panel overlay on desktop so tabs and pseudo-code remain reachable rather than being clipped below the fixed presentation viewport.
- Reduced motion: the existing `prefers-reduced-motion` branch and final-state presentation remain unchanged; displacement is suppressed by the new matrix-aligned CSS, while every node retains visible text status. The prior Runtime reduced-motion regression test remains applicable because node IDs, phases, status mapping, and replay timing hooks were preserved.
- Data consistency in the live browser: selected channel score `100` equals result score `100`; summary path equals result path; summary ACK equals result ACK; packet `#9`, risk `100 / 原始 279`, retry `4`, and latency `1700 ms` are internally consistent.
- Browser console errors: `0`.
- `npm run build`: passed after the final CSS, markup, and keyboard changes, including engine, route, sync, Matrix score-contract, and transition/performance tests.

## Comparison history

- Audit / before: P1 — Runtime combined seven equal-width process cards, five summary cells, five channel cards, a nested result grid, cockpit imagery, radar ornament, and technical evidence. The resulting type fell to `7–10 px` and did not match Matrix's simple row/result grammar.
- Fix: replaced the process cards with Matrix-style rows, moved channel evaluation into a full-width lower layer, flattened surfaces, removed the cockpit/radar treatment, and added one large state-derived selected-channel score to the result panel.
- Pass 1 evidence: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/03-runtime-after-pass1-1440x900.png`. P2 — the six result fields were flex-shrunk and visually clipped in the right panel.
- Pass 1 fix: changed result facts to a non-shrinking three-column/two-row grid, reduced internal margins, and preserved every required value. Post-fix evidence: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/04-runtime-after-pass2-1440x900.png`.
- Interaction pass: P2 — an expanded evidence drawer could extend below the fixed desktop stage. Fixed by presenting the open drawer as a bounded in-panel overlay and adding explicit Enter/Space behavior for details and replay controls. Post-fix evidence: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/matrix-runtime-alignment/12-runtime-keyboard-drawer-1280x720.png`.
- Final pass: the equal-size full-view and focused comparisons show no remaining actionable P0, P1, or P2 differences in typography, spacing, surfaces, color tokens, image usage, copy hierarchy, responsive structure, or visible interaction states.

## Follow-up polish

- P3: the candidate-reason copy is intentionally compact at 1280 × 720 to keep the complete story in one presentation viewport. The selected reason remains repeated at a larger, fully readable size in the conclusion panel.

---

# StarryLink「程式運行」跨頁設計語言整合 Design QA

## Current result

final result: passed

## Source truth and rendered evidence

- Source visual truth — Architecture: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/reference/02-architecture-1440x900.png`
- Source visual truth — Matrix: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/reference/04-matrix-1440x900.png`
- Runtime before integration: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/reference/05-runtime-before-1440x900.png`
- Final implementation: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/integrated/05-runtime-after-1440x900.png`
- Combined full-view comparison: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/runtime-design-comparison.png`
- Focused header comparison: `/Users/Yuz1ove/Documents/中華電信/demo/output/playwright/design-language/runtime-header-focus.png`
- Source and implementation captures are `1440 × 900` pixels from a `1440 × 900` CSS viewport at device scale factor `1`; no density normalization was required.
- State compared: settled Runtime flow using the current shared Demo state — Satellite selected at `100 / 100`, packet `#9`, ACK missing, display risk `100`, retry `4`.

## Findings

- No actionable P0, P1, or P2 finding remains.
- The final page uses the same metallic StarryLink logo navigation, cockpit image, near-black/ice-blue palette, thin cyan dividers, typography family, and restrained glass surfaces as Architecture and Matrix.
- The signal journey is one continuous horizontal rail rather than seven competing cards. Candidate channels form one subordinate comparison band, while the transmission result remains the only elevated conclusion surface.
- Technical evidence is collapsed by default at every viewport. It remains keyboard-operable, but no longer competes with the signal journey on entry.
- Engine reasons are still derived from the same score data, but presentation labels are localized (`紅色風險`, `骨幹不穩`, `地面中斷`) so the page no longer drops into debugger-like English fragments.

## Required fidelity surfaces

- Fonts and typography: Runtime now uses the same `Space Grotesk` + `Noto Sans TC` stack as the adjacent command-deck pages. The title, eyebrow, navigation, node labels, and result numbers match their weight and tracking hierarchy; no meaningful text is truncated at tested desktop sizes.
- Spacing and layout rhythm: the 48 px logo navigation, compact page header, five-field summary rail, 72/28 main split, and collapsed evidence bar follow Matrix proportions while retaining Architecture's cinematic negative space.
- Colors and visual tokens: near-black remains dominant; cyan identifies input and framing, violet marks the selected route, amber marks fallback, coral marks failure/risk, and mint marks ACK/success. Only the selected route is emphasized.
- Image quality and asset fidelity: the existing `starrylink-orbital-monolith-cropped.png` logo and `starship-command-room.png` cockpit asset are reused without replacement, stretching, generated substitutes, inline SVGs, emoji, or placeholder art.
- Copy and content: the original signal-processing story, packet values, channel scores, ACK, risk, retry, latency, and packet sequence remain state-driven. Only presentation strings were shortened or localized.

## Responsive, interaction, and accessibility evidence

- `1440 × 900`: zero horizontal overflow; main and result bottom at `658 px`, within the viewport.
- `1280 × 720`: zero horizontal overflow; main and result bottom at `555 px`, within the viewport.
- `390 × 844`: zero horizontal overflow; the journey becomes a vertical rail and the evidence drawer remains closed until requested.
- Keyboard: evidence drawer, tabs with Arrow/Home/End, algorithm drawer, and replay button all passed.
- Replay: disabled during the 7.2 s sequence and re-enabled at the settled state; no rapid infinite loop.
- Reduced motion: settled in `699 ms`; every node retained a readable final status.
- Data consistency: one selected channel; selected score, reason, packet sequence, ACK, path, and risk matched the shared view model at every tested viewport.
- Browser console errors: `0`.
- `npm run build`: passed, including engine, route, sync, Matrix contract, and transition/performance tests.

## Comparison history

- Audit pass: P1 — Runtime used the generic title/logo shell and a large simulation disclaimer while the preceding pages used the metallic logo and compact cinematic command deck. Fixed by reusing the existing page-specific navigation treatment, cockpit asset, and full-stage shell.
- Audit pass: P1 — seven boxed nodes, five boxed summaries, five channel cards, result card, and expanded evidence were visible simultaneously. Fixed by converting nodes and candidates into connected rails and collapsing technical evidence by default.
- Audit pass: P2 — channel reasons exposed raw English engine fragments such as `RED risk`, `backbone unstable`, and `ground down`. Fixed with a deterministic presentation mapping while preserving the original scores and reason components.
- Final pass: the combined and focused comparisons show no remaining actionable P0, P1, or P2 drift. A focused header crop was used because navigation scale, title rhythm, and summary density were too small to judge confidently in the four-up full-view sheet.

## Follow-up polish

- P3: the shared cockpit background is a raster asset, so image detail is ultimately limited by the existing source at unusually high zoom. No blur or scaling issue is visible in the required viewports.

---

# StarryLink 通訊系統啟動／同步序列 Design QA

## Current result

final result: passed

## Source truth and rendered evidence

- Source specification: `/Users/Yuz1ove/.codex/attachments/29bfd210-ad65-4903-9fa8-5f2287ad1a0f/pasted-text.txt`
- Source capture before refactor: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/cinematic-loading-20260804/before/01-0200ms-core.png`
- Primary implementation capture: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/cinematic-loading-20260804/after/02-routing-1800ms-1440x900.png`
- Combined full-view comparison: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/cinematic-loading-20260804/before-after-comparison-1440x900.png`
- Full final timeline: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/cinematic-loading-20260804/final-timeline-contact-sheet.png`
- Source and implementation captures: `1440 × 900` pixels at a `1440 × 900` CSS viewport. The in-app browser returns CSS-pixel-normalized screenshots, so no density resampling was needed.
- Combined comparison: `2880 × 900` pixels, source on the left and implementation on the right.
- State compared: the old route core at its only readable midpoint versus the new route's sustained `同步中繼節點` state.

## Findings

- No actionable P0, P1, or P2 issue remains.
- The sequence reads as Loading within the first second: the dark spatial veil, `STARRYLINK SYSTEM`, a legible percentage, staged node indicators, and `捕捉通訊訊號` are visible at `0.8s`.
- The single visual focus is a real Three.js/WebGL shader core with internal 3D energy strands, three independently moving magnetic orbits, four curved routing beams, six synchronized 3D nodes, and a restrained release wave. The core is not a CSS circle, spinner, SVG approximation, or full-screen video.
- Progress was sampled through a live route run and remained monotonic: `11 → 43 → 53 → 67 → 84 → 96 → 100 → 100`. It never reset or regressed.
- With the deterministic slow asset gate, the sequence stayed at `88% / 校準傳輸通道`, kept the overlay active, then continued to READY only after the readiness promise resolved.
- `SYSTEM READY` remains visible before the reveal, and the next page is exposed from behind the core rather than crossfaded through the loading layer.

## Required fidelity surfaces

- Fonts and typography: `Space Grotesk` carries the system label and tabular percentage; the existing Chinese UI family carries status text. Size, weight, tracking, and line height stay readable without creating a dashboard-like KPI.
- Spacing and layout rhythm: the core, progress, calibration nodes, status, and subline stay on one centered optical axis. The desktop composition preserves broad negative space; mobile uses a larger proportional core and tighter vertical rhythm rather than cropping the desktop canvas.
- Colors and visual tokens: near-black remains dominant across more than three quarters of the screen. Ice cyan is the primary energy color, deep blue defines volume, and violet stays a subordinate refraction accent. Bloom remains concentrated on the core and signal paths.
- Image quality and asset fidelity: the visible core is rendered by Three.js geometry and shader materials at a capped DPR of `1.5`; no placeholder art, CSS-drawn sphere, handcrafted SVG, emoji, or raster video was introduced. Mobile antialiasing was enabled after the first responsive pass showed jagged orbit edges.
- Copy and content: the only added copy is `STARRYLINK SYSTEM`, the six requested loading states, the percentage, and `正在建立韌性通訊鏈路`. There is no terminal noise, fake code, or meaningless data.

## Timeline evidence

1. `0.0s` — original page stable: `after/00-stable-1440x900.png`.
2. `0.8s` — core forming, progress visible, `捕捉通訊訊號`: `after/01-core-form-0800ms-1440x900.png`.
3. `1.8s` — curved signal routes and sequential nodes, `同步中繼節點`: `after/02-routing-1800ms-1440x900.png`.
4. `3.0s` — sustained `87–88%` calibration hold: `after/03-calibration-3000ms-1440x900.png`.
5. `3.9s` — `100% / SYSTEM READY` with the restrained release wave: `after/04-ready-3900ms-1440x900.png`.
6. `4.8s` — next page fully revealed and usable: `after/05-revealed-4800ms-1440x900.png`.

## Responsive and accessibility evidence

- `1440 × 900`: complete six-frame route timeline captured; no overflow or clipping.
- `1280 × 720`: `after/08-calibration-1280x720.png`; the full core and readout remain inside the viewport.
- `1024 × 768`: `after/09-routing-1024x768.png`; the routing core and text remain centered with zero horizontal overflow.
- `390 × 844`: `after/10-routing-390x844.png` and `after/11-ready-390x844.png`; the mobile core is proportionally larger, the readout has mobile-specific spacing, and the layout has zero horizontal overflow.
- Reduced motion: `after/12-reduced-motion-390x844.png`; the sequence uses a `650ms` dark mask, simplified progress, static core, and READY state with no 3D chase or energy burst. Slow assets can still extend the readiness hold.
- The progress element exposes `role="progressbar"`, a label, `aria-valuemin`, `aria-valuemax`, and live `aria-valuenow`. The page stage uses `aria-busy` only while the overlay is active.

## Interaction and cleanup verification

- A normal desktop route uses the centralized `4.8s` timeline; initial entry uses `5.2s`; mobile uses `4.2s` and `4.4s`; reduced motion uses `650ms`.
- Rapid `intro → architecture → matrix` input kept exactly one overlay and one master timeline. The queued destination completed normally and the final active page was Matrix.
- After every tested route, the overlay was hidden, `is-starry-transitioning` and `aria-busy` were removed, the active panel had no residual inline style, and navigation remained operable.
- The renderer only requests frames while the loading layer is active. Page hide kills the GSAP timeline, disconnects the resize observer, disposes Three.js resources, and releases the WebGL context.
- Browser console errors and warnings: `0`.
- `npm run build`: passed, including syntax checks, communication engine tests, route decision tests, sync tests, Matrix score-contract tests, and the updated transition/performance contract.
- `git diff --check`: passed.

## Comparison history

- Before refactor: P1 — the full route transition was `0.86s`, page commit occurred at `0.56s`, no percentage existed, and the only readable frame was a small hex-coated sphere with one short status line.
- Pass 1: P1 — the READY release ring expanded outside the WebGL frustum and produced clipped triangular fragments. Fixed by replacing the flat ring with a bounded 3D torus wave and limiting its release scale.
- Pass 1: P2 — mobile orbit edges were visibly jagged. Fixed by enabling WebGL antialiasing on compact viewports and using a bounded `1.5` DPR.
- Final pass: the revised desktop and mobile captures show no remaining P0, P1, or P2 difference from the supplied loading-sequence specification.
- Focused region comparison was not required: at `1440 × 900`, the core, energy paths, percentage, nodes, and status copy are all clearly legible in the normalized full-view pair. Mobile received separate full-height evidence because its proportional composition intentionally differs.

---

# Archived: StarryLink 架構 → Demo「相位遮環」過場 Design QA

## Current result

final result: passed

## Source truth and implementation evidence

- Source visual truth: `/Users/Yuz1ove/.codex/generated_images/019fbd66-87a3-72f1-ba07-99b63dda8b45/exec-1b7e5649-9380-426f-887f-dc8f1d8c8b97.png`
- Implementation screenshot: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/phase-occlusion-midpoint-final.png`
- Combined full-view comparison: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/phase-occlusion-comparison-pass1.png`
- Source pixels: `1672 × 941`; normalized proportionally to `1280 × 720` for comparison.
- Implementation pixels: `1280 × 720`; browser CSS viewport `1280 × 720`, DPR `2`.
- State: Architecture is the outgoing page; `beam-dive` is active before the `handoff` commit. The ring is at full entrance scale, the first shutter is rotating away, and the center anchor is beginning to lock.

## Findings

- No unresolved P0, P1, or P2 mismatch remains.
- The final implementation preserves the approved hierarchy: near-black page dim, one compact white-blue ring, matte-black occluding lobe, tiny center point, upward energy drop, faint reflection, and broad negative space.
- Intentional implementation behavior: a second mask takes over after the first rotates out. Their visibility is cross-faded so the still frame reads as one clean shutter while motion remains continuous.
- Intentional product-state difference: the source mock uses a cleaner Architecture backdrop; the implementation evidence contains the current product disclaimer and live architecture carousel underneath the transition.

## Required fidelity surfaces

- Fonts and typography: the transition introduces no raster text, generated copy, or competing typography.
- Spacing and layout rhythm: the visible ring remains approximately `260 px` wide and centered in the `1280 × 720` viewport, matching the selected scale and negative-space ratio.
- Colors and visual tokens: the ring stays near-white with restrained ice-blue/periwinkle bloom; the shutter and background remain matte near-black without additional neon trails or HUD decoration.
- Image quality and asset fidelity: ring, shutter, and center anchor are generated raster assets with alpha compositing; there is no CSS-drawn replacement, inline SVG, duplicate page screenshot, or residual terrain asset.
- Copy and content: the overlay adds no label, loading message, logo, or interface chrome.

## Interaction and cleanup verification

- Forward route tested: `architecture → demo`; the handoff committed to Demo, then cleared the variant, overlay, and transitioning class.
- Reverse route tested: `demo → architecture`; Architecture became the only active panel and focus returned to its heading.
- All four image instances completed loading at their expected natural dimensions (`1254 × 1254` ring and masks; `96 × 96` anchor).
- The discarded `orbital-collapse-field.png` and `orbital-collapse-core.png` files were removed after all runtime references were cleared.
- `npm run build`, the transition/performance contract, and `git diff --check` passed.

## Defects found and resolved

- P1: the first compositing pass exposed the ring asset's black square because its source background was opaque. The generated source was converted to a soft alpha matte and cache-busted.
- P2: simultaneous full-opacity shutter masks formed a heavy cross shape. The masks now alternate through a controlled fade and opposing rotation.
- P2: the main shutter could temporarily hide the center lock point. A small anchor crop derived from the generated ring now sits above the masks and fades in during `scan`.

## Comparison history

- Final pass evidence: `phase-occlusion-comparison-pass1.png`.
- Earlier P0/P1/P2 findings: opaque square, overlapping shutters, and occluded center point.
- Fixes after visual inspection: alpha-matted ring source, reduced mask scale, sequential mask cross-fade, and separate generated center anchor.
- Focused crop: not required; the normalized full-view pair keeps the entire transition and its negative space legible.

---

## Archived「軌道墜縮」過場 QA

# StarryLink 架構 → Demo「軌道墜縮」過場 Design QA

## Current result

final result: passed

## Source truth and implementation evidence

- Source visual truth: `/Users/Yuz1ove/.codex/generated_images/019fbd66-87a3-72f1-ba07-99b63dda8b45/exec-f406f8a5-8daf-4fb3-8732-afc176ff6fcd.png`
- Implementation screenshot: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/orbital-collapse-midpoint.png`
- Combined full-view comparison: `/Users/Yuz1ove/Documents/中華電信/demo/.design-qa/orbital-collapse-comparison-pass1.png`
- Source pixels: `1672 × 941`; normalized to `1280 × 720` with proportional scaling and black edge padding.
- Implementation pixels: `1280 × 720`; browser CSS viewport `1280 × 720`, reported DPR `2`; browser capture was already normalized to CSS-pixel dimensions.
- State: Architecture page outgoing, `beam-dive` midpoint at approximately `360 ms`, orbital field opacity `0.873`, orbital core opacity `0.941`.

## Findings

- No actionable P0, P1, or P2 mismatch was found.
- P3: the implementation core uses a slightly denser set of ring segments than the selected mock. This is acceptable because the separate core asset keeps the convergence point legible during the collapse and expansion phases without changing the overall hierarchy.
- Intentional product-state difference: the source mock shows Demo copy beneath the overlay, while the implementation evidence correctly shows the Architecture page as the outgoing surface for the Architecture → Demo transition.

## Required fidelity surfaces

- Fonts and typography: unchanged product typography remains underneath the transition; no generated or raster text was introduced.
- Spacing and layout rhythm: convergence stays at approximately `38% / 54%`; the foreground sweep, right-side lanes, negative space, and small core match the selected composition.
- Colors and visual tokens: cyan, electric blue, and restrained violet match the selected mock; black remains dominant and bloom is concentrated on the track tips and core.
- Image quality and asset fidelity: both transition layers are generated raster assets with correct aspect ratios and no UI screenshot baked into them; no duplicate terrain, header, controls, inline SVG, or CSS-drawn substitute is present.
- Copy and content: the overlay adds no copy, labels, loading text, or interface chrome; existing application copy remains unchanged.

## Interaction and cleanup verification

- Forward route tested: `architecture → demo`; the transition committed to Demo and cleared its variant and transitioning class.
- Reverse route tested: `demo → architecture`; the transition returned to Architecture with exactly one active panel and no residual overlay.
- Both generated assets were fully loaded before the interaction.
- `npm run build` and the transition/performance contract passed.

## Comparison history

- Pass 1 evidence: `orbital-collapse-comparison-pass1.png`.
- Earlier P0/P1/P2 findings: none.
- Fixes after comparison: none required.
- Focused crop: not required; the full-view comparison preserves both images at `1280 × 720`, and the core plus line spacing remain large enough to judge directly.

---

## Archived Matrix QA

# StarryLink 決策矩陣 Design QA

## Final result

**PASSED**

本輪設計 QA 未發現 P0、P1 或 P2 未解問題。頁面已形成清楚的「實體控制台發出投影 → 六項證據匯流 → 中央 80 分 → RED 最高處理優先級」敘事，並保留 StarryLink 既有駕駛艙與分頁架構。

## Source truth and implementation artifact

- 參考圖一：`/var/folders/2x/l0jqjrlj0tzdyy10bkn0x5d00000gn/T/codex-clipboard-318beb66-c1ee-4383-aa91-1ed1f358075c.png`
- 參考圖二：`/var/folders/2x/l0jqjrlj0tzdyy10bkn0x5d00000gn/T/codex-clipboard-5f2709cc-f377-46e6-9bb0-b1a4c283ae32.png`
- 修改前：`../docs/design-qa/starrylink-matrix-physical-hologram/02-before-result-1440x1024.png`
- 最終實作：`../docs/design-qa/starrylink-matrix-physical-hologram/08-final-aligned-1440x1024.png`
- 三圖並排比較：`../docs/design-qa/starrylink-matrix-physical-hologram/12-reference-and-final-comparison.png`
- 詳細裁決層：`../docs/design-qa/starrylink-matrix-physical-hologram/06-rationale-expanded-1440x1024.png`

三圖比較的左、中、右依序為：機械控制台參考、淡紫懸浮材質參考、最終 StarryLink 實作。

## Visual review

| 面向 | 結果 | 判定 |
| --- | --- | --- |
| 資訊層級 | 通過 | 中央 80 分為唯一主焦點；六項證據退為左右輔助帶；RED 與最高處理優先級形成結果收尾。 |
| 版面與間距 | 通過 | 上層面板置中，下層控制台沿同一投影軸排列；左右證據列在三個桌面視窗保持對稱。 |
| 色彩與材質 | 通過 | 保留深黑駕駛艙與金屬甲板，加入低透明淡紫玻璃、冷白描邊、紫色投影反光；紅色只用於緊急裁決。 |
| 字體與可讀性 | 通過 | 中文主標、數值、英文技術標籤分層；重要狀態不依賴純色，均有文字和數值。 |
| 背景影像 | 通過 | 沿用既有雙層駕駛艙圖，沒有拉伸或硬裁；投影面板保持透明，背景仍可辨識。 |
| 控制與圖示 | 通過 | 主啟動／重算與次要詳細依據的形狀、層級和位置不同；六個實體按鍵均有可讀標籤。 |
| 無障礙 | 通過 | 所有操作使用原生 button；詳情層維護 `aria-expanded`、`aria-hidden` 與焦點回復；鍵盤 focus 可連動證據。 |

## Interaction and motion review

- 首次進入：控制台通電、投影面板升起、六項證據依序匯入、分數累加至 80、門檻掃描、RED 裁決鎖定。
- 重新啟動：先收回上層投影，再重播完整計算，最終回到 80 / RED。
- 六項對照：實體分區按鍵與對應證據帶、中央環段共用 focus/hover 高亮。
- 裁決依據：從右下次要按鍵開啟非模態深度層，可用返回按鍵或 Escape 關閉，並回復觸發按鍵焦點。
- reduced-motion：測試模式下投影柱隱藏、持續校準動畫為 `none`，資訊與計算結果仍完整。

## Responsive review

| 視窗 | 截圖 | 結果 |
| --- | --- | --- |
| 1440 × 1024 | `08-final-aligned-1440x1024.png` | 通過；無水平溢位，中央核心與門檻尺完整。 |
| 1600 × 900 | `09-final-1600x900.png` | 通過；畫面保持雙層結構，主裁決在首屏。 |
| 1920 × 1080 | `10-final-1920x1080.png` | 通過；面板最大寬度受控，未過度拉伸。 |

三個視窗的 `body.scrollWidth` 均等於 `documentElement.clientWidth`。

## Defects found and resolved

- P1：動態證據容器初版參與 grid 排版，導致左右資料帶偏離面板。已改為面板內的絕對定位層。
- P1：初版下層控制台過空，未承擔操作與投影來源。已補齊中央投影座、六分區按鍵、狀態面板與主次控制。
- P1：門檻尺過近下層甲板且讀取被截。已移入透明上層面板並置於分數核心下方。
- P2：裁決依據關閉後焦點未穩定回到觸發按鍵。已補上 focus restoration。
- P2：查詢參數模擬 reduced-motion 時仍保留 CSS 持續動畫。已加入 `data-motion="reduced"` 的同級降級規則。

## Verification

- `npm run build`：通過。
- JavaScript syntax checks：通過，含 `matrix-holographic.js`。
- `communicationEngine.test.js`、`routeDecisionEngine.test.js`、`syncService.test.js`：通過。
- `matrix-score-contract.test.js`：通過，六項因素合計上限維持 100 分。
- `performance-contract.test.mjs`：通過。
- `git diff --check`：通過。
- 瀏覽器 console warnings/errors：0。

## Residual reservation

僅有 P3 級限制：駕駛艙背景為既有點陣圖，在高倍率縮放時細節上限由原始素材決定；目標桌面視窗未見失真或影響閱讀。
