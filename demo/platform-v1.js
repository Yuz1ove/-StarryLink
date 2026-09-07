(function (global) {
  "use strict";

  const root = document.querySelector("[data-resilience-platform]");
  if (!root) return;

  let snapshot = null;
  let storyIndex = 0;
  let storyTimer = 0;
  const modeButtons = Array.from(root.querySelectorAll("[data-platform-mode]"));
  const modePanels = Array.from(root.querySelectorAll("[data-platform-panel]"));
  const storyItems = Array.from(root.querySelectorAll("[data-story-jump]"));

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function text(selector, value) {
    const element = root.querySelector(selector);
    if (element) element.textContent = value ?? "—";
  }

  function percent(value, digits = 1) {
    return `${(Number(value || 0) * 100).toFixed(digits)}%`;
  }

  function metric(value, suffix = "") {
    return `${Number(value || 0).toFixed(1)}${suffix}`;
  }

  async function readJson(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }

  async function loadState() {
    root.dataset.status = "loading";
    text("[data-platform-status]", "正在連接 deterministic engine…");
    try {
      const payload = await readJson(await fetch("/api/state", { cache: "no-store" }));
      render(payload.resilience || (await readJson(await fetch("/api/resilience", { cache: "no-store" }))));
    } catch (error) {
      root.dataset.status = "error";
      text("[data-platform-status]", `Backend unavailable / ${error.message}`);
      console.error("StarryLink resilience platform failed to load", error);
    }
  }

  function setMode(mode) {
    root.dataset.mode = mode;
    modeButtons.forEach((button) => {
      const active = button.dataset.platformMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    modePanels.forEach((panel) => {
      const active = panel.dataset.platformPanel === mode;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  function storyChapters(state) {
    const incident = state.scenario.incident;
    const selected = state.candidates.find((item) => item.id === state.decision.selectedCandidateId);
    return [
      { phase: "CALM", title: "通訊仍在運作", copy: `基準拓樸共有 ${state.networkSummary.nodes} 個節點、${state.networkSummary.links} 條鏈路；所有結果將由固定輸入推導。` },
      { phase: "SENSE", title: "災害被感知", copy: `${state.scenario.name}；事件嚴重度 ${incident.severity}，需求放大 ${state.controls.demandMultiplier} 倍。` },
      { phase: "MODEL", title: "網路開始退化", copy: `${state.networkSummary.failedNodes.length} 個節點與 ${state.networkSummary.failedLinks.length} 條鏈路失效；延遲、頻寬、可靠度與 packet loss 同步改變。` },
      { phase: "MODEL", title: "主要路徑中斷", copy: `失效元件 ${state.networkSummary.failedNodes.concat(state.networkSummary.failedLinks).join("、")} 被排除，不能出現在 active path。` },
      { phase: "GENERATE", title: "53 bytes 求救", copy: `SLV1 binary packet 由真實 serialization 得到 ${state.emergencyMessage.payloadBytes} bytes，包含定位、類別、priority、TTL 與 CRC32。` },
      { phase: "GENERATE", title: "候選路徑形成", copy: `圖搜尋產生 ${state.candidates.length} 條仍可行的地、空、星替代路徑；fixture 只改環境，不指定勝者。` },
      { phase: "SIMULATE", title: `${state.runs} 次推演`, copy: `每條 candidate 使用 seed ${state.seed} 推演送達、延遲、覆蓋、能耗與可維持時間。` },
      { phase: "DECIDE", title: "策略被選中", copy: `${state.decision.selectedCandidateId} 以正規化分數 ${state.decision.score.toFixed(1)} 排名第一；UI 沒有 hardcoded winner。` },
      { phase: "EXECUTE", title: "部署開始", copy: `${selected.nodes.join(" → ")}；狀態從 PLANNED、DEPLOYING 進入 ACTIVE。` },
      { phase: "RECOVERY", title: "網路重新連接", copy: `可解釋的 resilience score 從 ${state.resilience.before.score} 回升至 ${state.resilience.after.score}。` },
      { phase: "VERIFY", title: "預測接受質疑", copy: `預測送達 ${percent(state.verification.predicted.deliveryRate)}；觀測 ${percent(state.verification.observed.deliveryRate)}，狀態 ${state.verification.status}。` },
      { phase: "REPLAN", title: state.replan.required ? "需要有限重規劃" : "閉環穩定", copy: `${state.replan.reason}；max replans ${state.execution.bounded.maxReplans}、cooldown ${state.execution.bounded.cooldownSec}s、minimum improvement ${percent(state.execution.bounded.minimumImprovement, 0)}。` },
    ];
  }

  function renderStory(index) {
    if (!snapshot) return;
    const chapters = storyChapters(snapshot);
    storyIndex = (index + chapters.length) % chapters.length;
    const chapter = chapters[storyIndex];
    text("[data-story-step-index]", `${String(storyIndex + 1).padStart(2, "0")} / ${chapters.length}`);
    text("[data-story-phase]", chapter.phase);
    text("[data-story-title]", chapter.title);
    text("[data-story-copy]", chapter.copy);
    storyItems.forEach((item, itemIndex) => {
      item.classList.toggle("active", itemIndex === storyIndex);
      item.classList.toggle("passed", itemIndex < storyIndex);
    });
  }

  function toggleStoryPlayback() {
    const button = root.querySelector("[data-story-play]");
    if (storyTimer) {
      clearTimeout(storyTimer);
      storyTimer = 0;
      button.textContent = "播放完整閉環";
      return;
    }
    button.textContent = "暫停閉環";
    const advance = () => {
      renderStory(storyIndex + 1);
      if (storyIndex === 11) {
        storyTimer = 0;
        button.textContent = "重新播放閉環";
        return;
      }
      storyTimer = global.setTimeout(advance, global.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1200 : 2200);
    };
    storyTimer = global.setTimeout(advance, 300);
  }

  function topologyCoordinates(nodes) {
    const layerOrder = ["space", "air", "ground", "sea"];
    const yByLayer = { space: 90, air: 220, ground: 375, sea: 500 };
    const positions = {};
    layerOrder.forEach((layer) => {
      const layerNodes = nodes.filter((node) => node.layer === layer).sort((a, b) => a.position.lng - b.position.lng || a.id.localeCompare(b.id));
      layerNodes.forEach((node, index) => {
        positions[node.id] = { x: 80 + ((index + 1) * 840) / (layerNodes.length + 1), y: yByLayer[layer] };
      });
    });
    return positions;
  }

  function renderTopology(state) {
    const svg = root.querySelector("[data-topology-map]");
    if (!svg) return;
    const namespace = "http://www.w3.org/2000/svg";
    const selected = state.candidates.find((item) => item.id === state.decision.selectedCandidateId);
    const selectedLinks = new Set(selected?.links || []);
    const selectedNodes = new Set(selected?.nodes || []);
    const positions = topologyCoordinates(state.network.nodes);
    svg.replaceChildren();
    [
      ["SPACE", 90], ["AIR", 220], ["GROUND", 375], ["SEA", 500],
    ].forEach(([label, y]) => {
      const line = document.createElementNS(namespace, "line");
      line.setAttribute("x1", "58"); line.setAttribute("x2", "950"); line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "rgba(101,145,178,.12)"); line.setAttribute("stroke-width", "1");
      svg.append(line);
      const textNode = document.createElementNS(namespace, "text");
      textNode.setAttribute("x", "12"); textNode.setAttribute("y", String(y + 4)); textNode.setAttribute("class", "layer-label"); textNode.textContent = label;
      svg.append(textNode);
    });
    state.network.links.forEach((link) => {
      const source = positions[link.source];
      const target = positions[link.target];
      if (!source || !target) return;
      const path = document.createElementNS(namespace, "path");
      const middle = (source.y + target.y) / 2;
      path.setAttribute("d", `M ${source.x} ${source.y} C ${source.x} ${middle}, ${target.x} ${middle}, ${target.x} ${target.y}`);
      path.setAttribute("class", `topology-link${selectedLinks.has(link.id) ? " selected" : ""}${link.status === "failed" ? " failed" : ""}`);
      path.dataset.linkId = link.id;
      svg.append(path);
    });
    state.network.nodes.forEach((node) => {
      const point = positions[node.id];
      const group = document.createElementNS(namespace, "g");
      group.setAttribute("class", `topology-node ${node.status}${selectedNodes.has(node.id) ? " selected" : ""}`);
      group.setAttribute("transform", `translate(${point.x} ${point.y})`);
      const circle = document.createElementNS(namespace, "circle");
      circle.setAttribute("r", selectedNodes.has(node.id) ? "8" : "6");
      const label = document.createElementNS(namespace, "text");
      label.setAttribute("x", "0"); label.setAttribute("y", "22"); label.setAttribute("text-anchor", "middle");
      label.textContent = node.id.replace(/-0\d$/, "");
      const title = document.createElementNS(namespace, "title");
      title.textContent = `${node.id} / ${node.type} / ${node.status}`;
      group.append(title, circle, label);
      svg.append(group);
    });
  }

  function renderMission(state) {
    const decision = state.decision;
    const selected = state.candidates.find((item) => item.id === decision.selectedCandidateId);
    const simulation = state.simulations.find((item) => item.candidateId === decision.selectedCandidateId);
    text("[data-mission-scenario]", state.scenario.name);
    text("[data-engine-version]", state.engineVersion);
    text("[data-input-hash]", state.inputHash.slice(0, 18));
    text("[data-score-before]", state.resilience.before.score.toFixed(1));
    text("[data-score-after]", state.resilience.after.score.toFixed(1));
    const componentSummary = (score) => Object.entries(score.contributions)
      .map(([name, value]) => `${name} +${Number(value).toFixed(1)}`)
      .join(" · ");
    text("[data-resilience-why-before]", componentSummary(state.resilience.before));
    text("[data-resilience-why-after]", componentSummary(state.resilience.after));
    text("[data-selected-candidate]", decision.selectedCandidateId);
    text("[data-selected-path]", selected.nodes.join(" → "));
    text("[data-selected-score]", decision.score.toFixed(1));
    text("[data-selected-confidence]", percent(decision.confidence));
    text("[data-selected-p95]", metric(simulation.p95Latency, " ms"));
    text("[data-selected-reasons]", decision.reasons.map((reason) => `${reason.metric} +${reason.contribution.toFixed(1)}`).join(" · "));
    const lifecycle = root.querySelector("[data-execution-lifecycle]");
    lifecycle.innerHTML = state.execution.lifecycle.map((item) => `<span class="${item === "REPLAN_REQUIRED" ? "warn" : "done"}">${escapeHtml(item)}</span>`).join("");
    renderTopology(state);
    syncFailureControls(state);
  }

  function renderAnalyst(state) {
    const simulationById = new Map(state.simulations.map((item) => [item.candidateId, item]));
    const candidateById = new Map(state.candidates.map((item) => [item.id, item]));
    const rows = root.querySelector("[data-candidate-rows]");
    rows.innerHTML = state.decision.ranking.map((ranked, index) => {
      const candidate = candidateById.get(ranked.candidateId);
      const simulation = simulationById.get(ranked.candidateId);
      const selected = ranked.candidateId === state.decision.selectedCandidateId;
      return `<tr class="${selected ? "selected" : ""}">
        <td><small>#${index + 1}</small><br><strong>${escapeHtml(ranked.candidateId)}</strong></td>
        <td class="candidate-route">${escapeHtml(candidate.nodes.join(" → "))}</td>
        <td>${percent(simulation.deliveryProbability)}</td>
        <td>${metric(simulation.meanLatency, " ms")}<br><small>P95 ${metric(simulation.p95Latency, " ms")}</small></td>
        <td>${percent(simulation.expectedCoverage)}</td>
        <td>${metric(simulation.energyCost)}</td>
        <td><strong>${ranked.score.toFixed(1)}</strong></td>
        <td class="candidate-verdict">${selected ? "SELECTED" : ranked.eligible ? "ELIGIBLE" : "EXCLUDED"}</td>
      </tr>`;
    }).join("");
    const weights = root.querySelector("[data-decision-weights]");
    weights.innerHTML = Object.entries(state.decision.weights).map(([name, value]) => `<div><span>${escapeHtml(name)}</span><i style="--weight:${value * 100}%"></i><b>${Math.round(value * 100)}%</b></div>`).join("");
    const whyNot = root.querySelector("[data-why-not]");
    whyNot.innerHTML = state.decision.rejectedReasons.map((item, index) => `<li><span>0${index + 1}</span><b>${escapeHtml(item.candidateId)}</b><span>${escapeHtml(item.reason)}</span></li>`).join("");
    text("[data-verification-status]", state.verification.status);
    const predicted = state.verification.predicted;
    const observed = state.verification.observed;
    root.querySelector("[data-verification-grid]").innerHTML = [
      ["Predicted delivery", percent(predicted.deliveryRate)], ["Observed delivery", percent(observed.deliveryRate)],
      ["Predicted latency", metric(predicted.latencyMs, " ms")], ["Observed latency", metric(observed.latencyMs, " ms")],
      ["Predicted loss", percent(predicted.packetLoss)], ["Observed loss", percent(observed.packetLoss)],
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
    text("[data-packet-bytes]", `${state.emergencyMessage.payloadBytes} bytes / measured`);
    text("[data-packet-serialization]", state.emergencyMessage.serialization);
    text("[data-packet-hex]", state.emergencyMessage.packetHex);
    root.querySelector("[data-replay-list]").innerHTML = state.replay.map((item) => `<li><time>${item.timecode}</time><span>${escapeHtml(item.event)}</span></li>`).join("");
    root.querySelector("[data-audit-list]").innerHTML = state.audit.map((item) => `<li><time>${item.timestamp.slice(11, 19)}</time><code title="${escapeHtml(item.inputHash)}">${escapeHtml(item.event)} · ${escapeHtml(item.inputHash.slice(0, 12))}</code></li>`).join("");
  }

  function syncFailureControls(state) {
    const form = root.querySelector("[data-failure-form]");
    form.elements.scenarioId.value = state.scenario.id;
    const failed = new Set(state.networkSummary.failedNodes);
    form.elements.baseStation.checked = !failed.has("ground-bs-01");
    form.elements.fiber.checked = !failed.has("fiber-node-01");
    form.elements.satellite.checked = !failed.has("leo-sat-01");
    form.elements.uav.checked = !failed.has("uav-relay-03");
    for (const name of ["rainfall", "demandMultiplier", "power"]) {
      form.elements[name].value = state.controls[name];
    }
    form.elements.packetLoss.value = Math.round(Number(state.controls.injectedPacketLoss || 0) * 100);
    updateFailureOutputs();
  }

  function updateFailureOutputs() {
    const form = root.querySelector("[data-failure-form]");
    const suffixes = { rainfall: "", demandMultiplier: "×", power: "%", packetLoss: "%" };
    for (const name of Object.keys(suffixes)) {
      text(`[data-output="${name}"]`, `${form.elements[name].value}${suffixes[name]}`);
    }
  }

  async function runFailure(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("[data-failure-submit]");
    button.disabled = true;
    button.textContent = "ENGINE RUNNING…";
    root.dataset.status = "loading";
    try {
      const controls = {
        baseStation: form.elements.baseStation.checked,
        fiber: form.elements.fiber.checked,
        satellite: form.elements.satellite.checked,
        uav: form.elements.uav.checked,
        rainfall: Number(form.elements.rainfall.value),
        demandMultiplier: Number(form.elements.demandMultiplier.value),
        power: Number(form.elements.power.value),
        packetLoss: Number(form.elements.packetLoss.value),
      };
      const payload = await readJson(await fetch("/api/failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: form.elements.scenarioId.value, seed: snapshot?.seed, runs: snapshot?.runs || 240, controls }),
      }));
      render(payload);
      setMode("mission");
    } catch (error) {
      root.dataset.status = "error";
      text("[data-platform-status]", `FAILURE LAB rejected / ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "RUN FAILURE";
    }
  }

  function exportAudit() {
    if (!snapshot) return;
    const payload = JSON.stringify({
      engineVersion: snapshot.engineVersion,
      scenarioVersion: snapshot.scenarioVersion,
      seed: snapshot.seed,
      inputHash: snapshot.inputHash,
      audit: snapshot.audit,
    }, null, 2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    link.download = `starrylink-audit-${snapshot.scenario.id}-${snapshot.seed}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function render(state) {
    snapshot = state;
    root.dataset.status = "ready";
    text("[data-platform-provenance]", state.provenance);
    text("[data-platform-status]", `${state.engineVersion} / backend authoritative / ${state.verification.status}`);
    text("[data-platform-seed]", state.seed);
    text("[data-story-incident]", state.scenario.incident.type);
    text("[data-story-impact]", `${state.networkSummary.failedNodes.length} nodes / ${state.networkSummary.failedLinks.length} links`);
    text("[data-story-candidates]", String(state.candidates.length));
    text("[data-story-runs]", `${state.runs} × ${state.candidates.length}`);
    renderStory(storyIndex);
    renderMission(state);
    renderAnalyst(state);
  }

  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.platformMode)));
  storyItems.forEach((item) => item.addEventListener("click", () => renderStory(Number(item.dataset.storyJump))));
  root.querySelector("[data-story-prev]")?.addEventListener("click", () => renderStory(storyIndex - 1));
  root.querySelector("[data-story-next]")?.addEventListener("click", () => renderStory(storyIndex + 1));
  root.querySelector("[data-story-play]")?.addEventListener("click", toggleStoryPlayback);
  root.querySelector("[data-failure-form]")?.addEventListener("submit", runFailure);
  root.querySelectorAll("[data-failure-form] input").forEach((input) => input.addEventListener("input", updateFailureOutputs));
  root.querySelector("[data-export-audit]")?.addEventListener("click", exportAudit);

  global.XY_RESILIENCE_PLATFORM = {
    getSnapshot: () => snapshot,
    setMode,
    reload: loadState,
    inspect: () => ({
      mode: root.dataset.mode,
      status: root.dataset.status,
      seed: snapshot?.seed || null,
      inputHash: snapshot?.inputHash || null,
      candidateCount: snapshot?.candidates?.length || 0,
      runs: snapshot?.runs || 0,
      selectedCandidateId: snapshot?.decision?.selectedCandidateId || null,
      verification: snapshot?.verification?.status || null,
    }),
  };

  loadState();
})(typeof window !== "undefined" ? window : globalThis);
