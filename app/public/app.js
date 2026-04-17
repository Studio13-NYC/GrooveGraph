const state = {
  runs: [],
  selectedRun: null,
  graph: null,
  activeTypes: new Set(),
  showFullGraph: false,
  selectedNodeId: null,
  inspectorTab: "trace",
  selectedStage: "plan",
};

const runsList = document.getElementById("runs-list");
const inspectorContent = document.getElementById("inspector-content");
const graphTitle = document.getElementById("graph-title");
const graphSubtitle = document.getElementById("graph-subtitle");
const stagePill = document.getElementById("stage-pill");
const stageSummary = document.getElementById("stage-summary");
const stageAdvance = document.getElementById("stage-advance");
const filterChips = document.getElementById("filter-chips");
const graphSearch = document.getElementById("graph-search");
const toggleViewButton = document.getElementById("toggle-view");
const inspectorTabs = Array.from(document.querySelectorAll(".inspector-tab"));
const runSubmit = document.getElementById("run-submit");
const refreshRunsButton = document.getElementById("refresh-runs");
const questionInput = document.getElementById("question-input");
const runFeedback = document.getElementById("run-feedback");
const runsRollup = document.getElementById("runs-rollup");
const toggleRunHistoryButton = document.getElementById("toggle-run-history");

const STAGE_LABELS = {
  plan: "Plan",
  evidence: "Evidence",
  extract: "Extract",
  persistence_proposal: "Proposal",
  commit: "Commit",
};

let showRunHistory = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function statusLabel(status) {
  return compactText(status).replaceAll("_", " ") || "unknown";
}

function prettyJson(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function setRunFeedback(kind, message) {
  runFeedback.className = `run-feedback ${kind}`.trim();
  runFeedback.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function setRunControlsBusy(isBusy) {
  runSubmit.disabled = isBusy;
  refreshRunsButton.disabled = isBusy;
  questionInput.disabled = isBusy;
  runSubmit.textContent = isBusy ? "Creating..." : "Create plan";
}

function setAdvanceBusy(isBusy) {
  stageAdvance.disabled = isBusy || !state.selectedRun?.awaitingApproval || !state.selectedRun?.nextStage;
  if (isBusy) {
    stageAdvance.textContent = "Advancing...";
    return;
  }
  stageAdvance.textContent = state.selectedRun?.nextStage
    ? `Approve ${STAGE_LABELS[state.selectedRun.currentStage] || state.selectedRun.currentStage} -> ${STAGE_LABELS[state.selectedRun.nextStage] || state.selectedRun.nextStage}`
    : "No next stage";
}

function setRunHistoryExpanded(expanded) {
  showRunHistory = expanded;
  toggleRunHistoryButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggleRunHistoryButton.textContent = expanded ? "v Previous runs" : "^ Previous runs";
}

function artifactByStage(stageName) {
  return state.selectedRun?.artifacts?.find((artifact) => artifact.stage === stageName) ?? null;
}

async function refreshRuns() {
  const response = await fetch("/runs");
  const payload = await response.json();
  state.runs = payload.runs || [];
  runsList.innerHTML = "";
  runsRollup.classList.add("hidden");

  if (!state.runs.length) {
    runsList.innerHTML = '<p class="runs-empty">No runs yet. Create a plan to begin the single-path workflow.</p>';
    return;
  }

  const [latestRun, ...previousRuns] = state.runs;
  if (latestRun) {
    runsList.appendChild(buildRunCard(latestRun));
  }
  if (previousRuns.length) {
    runsRollup.classList.remove("hidden");
    const history = document.createElement("div");
    history.className = `run-history ${showRunHistory ? "" : "hidden"}`.trim();
    for (const run of previousRuns) {
      history.appendChild(buildRunCard(run));
    }
    runsList.appendChild(history);
  }
}

function buildRunCard(run) {
  const card = document.createElement("article");
  card.className = "run-card";
  if (state.selectedRun?.runId === run.run_id) {
    card.classList.add("active");
  }

  const next = run.awaiting_approval && run.next_stage
    ? `Waiting for approval: ${STAGE_LABELS[run.next_stage] || run.next_stage}`
    : "No pending stage";

  card.innerHTML = `
    <div class="run-card-header">
      <h3>${escapeHtml(run.question || run.run_id)}</h3>
      <span class="status-pill ${run.status || "awaiting_approval"}">${statusLabel(run.status || "awaiting_approval")}</span>
    </div>
    <p>${escapeHtml(run.summary || "No summary yet.")}</p>
    <p class="run-meta">${escapeHtml(STAGE_LABELS[run.current_stage] || run.current_stage)} • ${escapeHtml(next)}</p>
    <div class="run-card-actions">
      <span>${escapeHtml(run.run_id)}</span>
      <button type="button" class="run-open-button">Open</button>
    </div>
  `;
  card.addEventListener("click", () => selectRun(run.run_id));
  card.querySelector(".run-open-button").addEventListener("click", async (event) => {
    event.stopPropagation();
    await selectRun(run.run_id);
  });
  return card;
}

async function submitRun(question) {
  setRunControlsBusy(true);
  setRunFeedback("running", `Creating plan for "${question}"...`);

  try {
    const response = await fetch("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || payload.error || `create_failed_${response.status}`);
    }

    const result = await response.json();
    await refreshRuns();
    await selectRun(result.run_id);
    setRunFeedback("success", `Plan created. Review the stage output, then approve the next step.`);
  } catch (error) {
    setRunFeedback("error", `Plan creation failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  } finally {
    setRunControlsBusy(false);
  }
}

async function advanceSelectedRun() {
  if (!state.selectedRun?.runId || !state.selectedRun?.nextStage) {
    return;
  }
  setAdvanceBusy(true);
  setRunFeedback("running", `Advancing to ${STAGE_LABELS[state.selectedRun.nextStage] || state.selectedRun.nextStage}...`);

  try {
    const response = await fetch(`/runs/${state.selectedRun.runId}/advance`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || payload.error || `advance_failed_${response.status}`);
    }

    await refreshRuns();
    await selectRun(state.selectedRun.runId);
    setRunFeedback("success", "Stage completed. Review the new output before approving the next step.");
  } catch (error) {
    setRunFeedback("error", `Advance failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  } finally {
    setAdvanceBusy(false);
  }
}

async function selectRun(runId) {
  const runResponse = await fetch(`/runs/${runId}`);
  if (!runResponse.ok) {
    inspectorContent.innerHTML = "<p>This run record is no longer available. Refreshing the run list.</p>";
    await refreshRuns();
    return;
  }
  const runPayload = await runResponse.json();
  state.selectedRun = runPayload.run;
  state.selectedStage = state.selectedRun.currentStage || "plan";

  const graphResponse = await fetch(`/runs/${runId}/graph`);
  const graphPayload = await graphResponse.json();
  state.graph = graphPayload.graph;
  state.selectedNodeId = state.graph?.nodes?.[0]?.id ?? null;
  state.activeTypes = new Set(state.graph?.view?.filters || []);
  renderRun();
}

function renderRun() {
  if (!state.selectedRun || !state.graph) {
    graphTitle.textContent = "No run selected";
    graphSubtitle.textContent = "Create a plan to start the human-steered pipeline.";
    stagePill.textContent = "no run";
    stagePill.className = "status-pill";
    stageSummary.textContent = "No stage output yet.";
    stageAdvance.disabled = true;
    inspectorContent.innerHTML = "<p>No run selected.</p>";
    return;
  }

  graphTitle.textContent = state.selectedRun.question;
  const currentArtifact = artifactByStage(state.selectedRun.currentStage) || state.selectedRun.artifacts?.[state.selectedRun.artifacts.length - 1] || null;
  graphSubtitle.textContent = state.selectedRun.awaitingApproval && state.selectedRun.nextStage
    ? `Current stage: ${STAGE_LABELS[state.selectedRun.currentStage] || state.selectedRun.currentStage}. Next stage waits for approval: ${STAGE_LABELS[state.selectedRun.nextStage] || state.selectedRun.nextStage}.`
    : `Current stage: ${STAGE_LABELS[state.selectedRun.currentStage] || state.selectedRun.currentStage}.`;
  stagePill.textContent = statusLabel(currentArtifact?.status || state.selectedRun.status);
  stagePill.className = `status-pill ${currentArtifact?.status || state.selectedRun.status}`;
  stageSummary.textContent = state.selectedRun.summary || "No summary available.";
  setAdvanceBusy(false);
  renderFilterChips();
  renderInspector();
  renderGraph();
  refreshRuns();
}

function renderFilterChips() {
  filterChips.innerHTML = "";
  for (const type of state.graph?.view?.filters || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip ${state.activeTypes.has(type) ? "active" : ""}`;
    chip.textContent = type;
    chip.addEventListener("click", () => {
      if (state.activeTypes.has(type)) {
        state.activeTypes.delete(type);
      } else {
        state.activeTypes.add(type);
      }
      renderGraph();
    });
    filterChips.appendChild(chip);
  }
}

function renderInspector() {
  for (const button of inspectorTabs) {
    button.classList.toggle("active", button.dataset.tab === state.inspectorTab);
  }

  if (!state.selectedRun) {
    inspectorContent.innerHTML = "<p>No run selected.</p>";
    return;
  }

  if (state.inspectorTab === "metadata") {
    renderMetadataPanel();
    return;
  }
  if (state.inspectorTab === "evidence") {
    renderEvidencePanel();
    return;
  }
  if (state.inspectorTab === "extract") {
    renderExtractionPanel();
    return;
  }
  renderTracePanel();
}

function renderTracePanel() {
  const selectedArtifact = artifactByStage(state.selectedStage) || artifactByStage(state.selectedRun.currentStage) || null;
  const traceLayout = document.createElement("div");
  traceLayout.className = "trace-layout";

  const stageColumn = document.createElement("div");
  stageColumn.className = "stage-list";
  for (const stage of state.selectedRun.artifacts || []) {
    const card = document.createElement("article");
    card.className = `stage-card ${stage.stage === state.selectedStage ? "active" : ""}`;
    card.innerHTML = `
      <div class="stage-header">
        <h3>${escapeHtml(STAGE_LABELS[stage.stage] || stage.stage)}</h3>
        <span class="status-pill ${stage.status}">${statusLabel(stage.status)}</span>
      </div>
      <p>${Object.entries(stage.counts).map(([key, value]) => `${key}: ${value}`).join(" • ") || "no counts"}</p>
    `;
    card.addEventListener("click", () => {
      state.selectedStage = stage.stage;
      renderTracePanel();
    });
    stageColumn.appendChild(card);
  }

  const detailColumn = document.createElement("div");
  detailColumn.className = "trace-samples";
  detailColumn.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Run Trace</h2>
        <p>Every completed stage artifact is preserved and reviewable.</p>
      </div>
      <span class="status-pill ${selectedArtifact?.status || "ok"}">${statusLabel(selectedArtifact?.status || "ok")}</span>
    </div>
    <div class="summary-card">
      <h3>Run status</h3>
      <p>${escapeHtml(statusLabel(state.selectedRun.status))}</p>
      <p>${escapeHtml(state.selectedRun.summary || "")}</p>
      <p>${state.selectedRun.awaitingApproval && state.selectedRun.nextStage ? `Waiting for approval to enter ${escapeHtml(STAGE_LABELS[state.selectedRun.nextStage] || state.selectedRun.nextStage)}.` : "No pending stage."}</p>
    </div>
    <div class="trace-sample-block">
      <h3>${escapeHtml(STAGE_LABELS[selectedArtifact?.stage] || selectedArtifact?.stage || "artifact")}</h3>
      ${prettyJson(selectedArtifact?.output_sample ?? {})}
    </div>
  `;

  traceLayout.appendChild(stageColumn);
  traceLayout.appendChild(detailColumn);
  inspectorContent.innerHTML = "";
  inspectorContent.appendChild(traceLayout);
}

function renderEvidencePanel() {
  const planArtifact = artifactByStage("plan");
  const evidenceArtifact = artifactByStage("evidence");
  const plan = planArtifact?.output_sample?.query_plan || {};
  const sources = evidenceArtifact?.output_sample?.sources || {};

  inspectorContent.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Evidence</h2>
        <p>Source plan first, then the collected evidence bundle.</p>
      </div>
    </div>
    <article class="summary-card">
      <h3>Source plan</h3>
      ${prettyJson(plan)}
    </article>
    <div class="sources-layout">
      ${Object.entries(sources).map(([key, value]) => {
        const snippet = Array.isArray(value?.snippets) && value.snippets[0] ? value.snippets[0].snippet : (value?.detail || "");
        return `
          <article class="source-card ${value?.ok ? "" : "disabled"}">
            <div class="stage-header">
              <h3>${escapeHtml(key)}</h3>
              <span class="status-pill ${value?.ok ? "ok" : "warning"}">${value?.ok ? "ok" : "warning"}</span>
            </div>
            <p>${escapeHtml(value?.detail || "")}</p>
            <p>${escapeHtml(snippet)}</p>
            ${prettyJson({
              request_sample: value?.request_sample || {},
              response_sample: value?.response_sample || {},
            })}
          </article>
        `;
      }).join("") || '<p class="runs-empty">No evidence has been collected for this run yet.</p>'}
    </div>
  `;
}

function groupBy(items, keyFn) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = grouped.get(key) || [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

function renderEntityCard(entity) {
  const properties = Object.entries(entity.properties || {}).slice(0, 6);
  return `
    <article class="extract-card">
      <div class="extract-card-header">
        <h4>${escapeHtml(entity.text || entity.label || "Unnamed entity")}</h4>
        <span class="status-pill ok">${escapeHtml(entity.label || "unknown")}</span>
      </div>
      <p>confidence ${Number(entity.confidence || 0).toFixed(2)} • ${escapeHtml((entity.sources || []).join(", ") || "unknown source")}</p>
      ${entity.evidence?.[0] ? `<p>${escapeHtml(entity.evidence[0])}</p>` : ""}
      ${properties.length ? `<div class="extract-pill-row">${properties.map(([key, value]) => `<span class="extract-pill">${escapeHtml(key)}: ${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</span>`).join("")}</div>` : ""}
    </article>
  `;
}

function renderRelationCard(relation) {
  return `
    <article class="extract-card">
      <div class="extract-card-header">
        <h4>${escapeHtml(relation.type || "relation")}</h4>
        <span class="status-pill ok">${escapeHtml(relation.source_label || "unknown")} -> ${escapeHtml(relation.target_label || "unknown")}</span>
      </div>
      <p>${escapeHtml(relation.source_entity || "unknown")} -> ${escapeHtml(relation.target_entity || "unknown")}</p>
      <p>confidence ${Number(relation.confidence || 0).toFixed(2)} • ${escapeHtml(relation.source || "unknown source")}</p>
      ${relation.evidence ? `<p>${escapeHtml(relation.evidence)}</p>` : ""}
    </article>
  `;
}

function renderPropertyCard(property) {
  return `
    <article class="extract-card">
      <div class="extract-card-header">
        <h4>${escapeHtml(property.subject || "unknown subject")}</h4>
        <span class="status-pill ok">${escapeHtml(property.property || "property")}</span>
      </div>
      <p>${escapeHtml(property.value || "")}</p>
      <p>confidence ${Number(property.confidence || 0).toFixed(2)} • ${escapeHtml(property.source || "unknown source")}</p>
      ${property.evidence ? `<p>${escapeHtml(property.evidence)}</p>` : ""}
    </article>
  `;
}

function renderExtractionPanel() {
  const extractArtifact = artifactByStage("extract");
  const extract = extractArtifact?.output_sample || {};
  const entities = Array.isArray(extract.entities) ? [...extract.entities] : [];
  const relations = Array.isArray(extract.relations) ? [...extract.relations] : [];
  const properties = Array.isArray(extract.properties) ? [...extract.properties] : [];

  if (!entities.length && !relations.length && !properties.length) {
    inspectorContent.innerHTML = `
      <div class="candidate-empty">
        <h2>Extraction</h2>
        <p>No extractor output is available for this run yet.</p>
      </div>
    `;
    return;
  }

  entities.sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
  relations.sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
  properties.sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
  const entitiesByLabel = groupBy(entities, (entity) => entity.label || "Unknown");

  inspectorContent.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Extraction</h2>
        <p>Real extractor output from the collected evidence bundle.</p>
      </div>
      <span class="status-pill ${extractArtifact?.status || "ok"}">${statusLabel(extractArtifact?.status || "ok")}</span>
    </div>
    <div class="summary-grid">
      <article class="summary-card"><h3>Entities</h3><p>${entities.length}</p></article>
      <article class="summary-card"><h3>Relations</h3><p>${relations.length}</p></article>
      <article class="summary-card"><h3>Properties</h3><p>${properties.length}</p></article>
    </div>
    <section class="extract-section">
      <div class="panel-header">
        <h3>Entities</h3>
        <p>Grouped by resolved label</p>
      </div>
      <div class="extract-groups">
        ${Array.from(entitiesByLabel.entries()).map(([label, grouped]) => `
          <article class="extract-group">
            <div class="extract-group-header">
              <h4>${escapeHtml(label)}</h4>
              <span>${grouped.length}</span>
            </div>
            <div class="extract-card-list">
              ${grouped.map(renderEntityCard).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="extract-section">
      <div class="panel-header">
        <h3>Relations</h3>
        <p>Only conservative relations anchored to resolved entities</p>
      </div>
      <div class="extract-card-list">
        ${relations.length ? relations.map(renderRelationCard).join("") : '<p class="runs-empty">No relations were extracted.</p>'}
      </div>
    </section>
    <section class="extract-section">
      <div class="panel-header">
        <h3>Properties</h3>
        <p>Source-backed structured facts</p>
      </div>
      <div class="extract-card-list">
        ${properties.length ? properties.map(renderPropertyCard).join("") : '<p class="runs-empty">No properties were extracted.</p>'}
      </div>
    </section>
  `;
}

function renderMetadataPanel() {
  const selected = state.graph?.nodes?.find((node) => node.id === state.selectedNodeId) || state.graph?.nodes?.[0];
  if (!selected) {
    inspectorContent.innerHTML = "<p>No node selected.</p>";
    return;
  }
  const rows = Object.entries(selected.metadata_preview || {}).map(([key, value]) => `
    <div class="meta-row">
      <span class="meta-key">${escapeHtml(key)}</span>
      <span class="meta-value">${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</span>
    </div>
  `).join("");

  inspectorContent.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Selected Node</h2>
        <p>Connected graph state only. Unsupported candidates stay in the extraction view.</p>
      </div>
      <span class="status-pill ${selected.status}">${statusLabel(selected.status)}</span>
    </div>
    <div class="meta-grid">
      <div class="meta-row"><span class="meta-key">label</span><span class="meta-value">${escapeHtml(selected.label)}</span></div>
      <div class="meta-row"><span class="meta-key">type</span><span class="meta-value">${escapeHtml(selected.type)}</span></div>
      <div class="meta-row"><span class="meta-key">status</span><span class="meta-value">${escapeHtml(selected.status)}</span></div>
      <div class="meta-row"><span class="meta-key">sources</span><span class="meta-value">${escapeHtml(selected.source_flags.join(", ") || "none")}</span></div>
      ${rows}
    </div>
  `;
}

function renderGraph() {
  if (!state.graph) {
    return;
  }

  const container = document.getElementById("graph-canvas");
  container.innerHTML = "";
  const searchTerm = graphSearch.value.trim().toLowerCase();
  const nodes = state.graph.nodes.filter((node) => {
    const typeAllowed = state.activeTypes.size ? state.activeTypes.has(node.type) : true;
    const searchAllowed = !searchTerm || node.label.toLowerCase().includes(searchTerm);
    const starterAllowed = state.showFullGraph || state.graph.view.focal_ids.includes(node.id) || node.degree_hint > 1;
    return typeAllowed && searchAllowed && starterAllowed;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = state.graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  if (!nodes.length) {
    container.innerHTML = '<div class="graph-empty"><p>No graph nodes match the current view.</p></div>';
    return;
  }

  const width = container.clientWidth || 900;
  const height = container.clientHeight || 520;
  const svg = d3.select(container).append("svg");
  const root = svg.append("g");

  svg.call(d3.zoom().scaleExtent([0.35, 4]).on("zoom", (event) => root.attr("transform", event.transform)));

  const color = d3.scaleOrdinal()
    .domain(["existing", "draft_added"])
    .range(["#8192ae", "#f4b860"]);

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((d) => d.id).distance(120))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(30));

  const link = root.append("g")
    .attr("stroke", "rgba(255,255,255,0.14)")
    .selectAll("line")
    .data(edges)
    .enter()
    .append("line")
    .attr("stroke-width", 1.5);

  const node = root.append("g")
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", (d) => d.status === "draft_added" ? 11 : 8)
    .attr("fill", (d) => color(d.status))
    .attr("stroke", "#fff")
    .attr("stroke-opacity", 0.55)
    .attr("stroke-width", 1.2)
    .call(
      d3.drag()
        .on("start", (event) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on("drag", (event) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on("end", (event) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }),
    )
    .on("click", (_, datum) => {
      state.selectedNodeId = datum.id;
      state.inspectorTab = "metadata";
      renderInspector();
    });

  const labels = root.append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .attr("class", "node-label")
    .text((d) => d.label);

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y);

    labels
      .attr("x", (d) => d.x + 13)
      .attr("y", (d) => d.y + 4)
      .style("opacity", (d) => d.degree_hint > 1 || state.graph.view.focal_ids.includes(d.id) ? 1 : 0.55);
  });
}

document.getElementById("run-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) {
    return;
  }
  await submitRun(question);
});

refreshRunsButton.addEventListener("click", async () => {
  setRunFeedback("", "Refreshing runs...");
  await refreshRuns();
  setRunFeedback("", "Ready.");
});

toggleRunHistoryButton.addEventListener("click", () => {
  setRunHistoryExpanded(!showRunHistory);
  refreshRuns();
});

toggleViewButton.addEventListener("click", () => {
  state.showFullGraph = !state.showFullGraph;
  toggleViewButton.textContent = state.showFullGraph ? "Full graph" : "Starter view";
  renderGraph();
});

graphSearch.addEventListener("input", () => renderGraph());

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    graphSearch.focus();
  }
});

for (const button of inspectorTabs) {
  button.addEventListener("click", () => {
    state.inspectorTab = button.dataset.tab || "trace";
    renderInspector();
  });
}

stageAdvance.addEventListener("click", async () => {
  await advanceSelectedRun();
});

setRunHistoryExpanded(false);
refreshRuns();
