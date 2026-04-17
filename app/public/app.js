const state = {
  runs: [],
  selectedRun: null,
  graph: null,
  activeTypes: new Set(),
  showFullGraph: false,
  selectedNodeId: null,
  inspectorTab: "trace",
  selectedStage: "graph_delta",
};

const runsList = document.getElementById("runs-list");
const inspectorContent = document.getElementById("inspector-content");
const graphTitle = document.getElementById("graph-title");
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

let showRunHistory = false;

function setRunFeedback(kind, message) {
  runFeedback.className = `run-feedback ${kind}`.trim();
  runFeedback.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function setRunControlsBusy(isBusy) {
  runSubmit.disabled = isBusy;
  refreshRunsButton.disabled = isBusy;
  questionInput.disabled = isBusy;
  runSubmit.textContent = isBusy ? "Running..." : "Run workflow";
}

function setRunHistoryExpanded(expanded) {
  showRunHistory = expanded;
  toggleRunHistoryButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggleRunHistoryButton.textContent = expanded ? "v Previous runs" : "^ Previous runs";
}

async function submitRun(question) {
  setRunControlsBusy(true);
  setRunFeedback("running", `Running workflow for "${question}"...`);

  try {
    const response = await fetch("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || payload.error || `run_failed_${response.status}`);
    }

    const result = await response.json();
    if (!result.run_id) {
      throw new Error("run_id_missing");
    }

    setRunFeedback("success", `Completed ${result.run_id}. Loading run trace...`);
    state.inspectorTab = "trace";
    await refreshRuns();
    await selectRun(result.run_id);
  } catch (error) {
    await refreshRuns();
    setRunFeedback("error", `Workflow request failed or was interrupted: ${error instanceof Error ? error.message : "unknown_error"}`);
  } finally {
    setRunControlsBusy(false);
  }
}

document.getElementById("run-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
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

function statusLabel(status) {
  return String(status || "").replaceAll("_", " ");
}

function prettyJson(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

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

function normalizeKey(value) {
  return compactText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function artifactByStage(stageName) {
  return state.selectedRun?.artifacts?.find((artifact) => artifact.stage === stageName) ?? null;
}

function nodeKey(nodeLike) {
  const normalized = compactText(nodeLike?.metadata_preview?.normalized_name || "") || normalizeKey(nodeLike?.label || "");
  return `${nodeLike?.type || "unknown"}:${normalized}`;
}

function getDebugCandidates() {
  const planArtifact = artifactByStage("persistence_plan");
  const graphKeys = new Set((state.graph?.nodes || []).map((node) => nodeKey(node)));
  const candidates = [
    ...((planArtifact?.output_sample?.rejected_candidates) || []),
    ...((planArtifact?.output_sample?.unpersisted_candidates) || []),
  ];
  const seen = new Set();
  const deduped = [];
  for (const candidate of candidates) {
    const key = nodeKey(candidate);
    if (!key || seen.has(key) || graphKeys.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

async function refreshRuns() {
  const response = await fetch("/runs");
  const payload = await response.json();
  state.runs = payload.runs || [];
  runsList.innerHTML = "";
  runsRollup.classList.add("hidden");

  if (!state.runs.length) {
    runsList.innerHTML = '<p class="runs-empty">No runs yet. Ask a question to start the serial workflow.</p>';
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
    card.innerHTML = `
      <div class="run-card-header">
        <h3>${escapeHtml(run.question || run.run_id)}</h3>
        <span class="status-pill ${run.status || "completed_with_warnings"}">${statusLabel(run.status || "completed_with_warnings")}</span>
      </div>
      <p>${escapeHtml(run.summary || "No summary yet.")}</p>
      <div class="run-card-actions">
        <span>${escapeHtml(run.run_id)}</span>
        <button type="button" class="run-trace-button">Inspect run trace</button>
      </div>
    `;
    card.addEventListener("click", () => selectRun(run.run_id));
    card.querySelector(".run-trace-button").addEventListener("click", async (event) => {
      event.stopPropagation();
      state.inspectorTab = "trace";
      await selectRun(run.run_id);
    });
    return card;
}

async function selectRun(runId) {
  const runResponse = await fetch(`/runs/${runId}`);
  if (!runResponse.ok) {
    await refreshRuns();
    inspectorContent.innerHTML = "<p>This run record is no longer available. Refreshing the run list.</p>";
    return;
  }
  const runPayload = await runResponse.json();
  state.selectedRun = runPayload.run;
  state.selectedStage = state.selectedRun.artifacts?.[state.selectedRun.artifacts.length - 1]?.stage || "graph_delta";
  const graphResponse = await fetch(`/runs/${runId}/graph`);
  const graphPayload = await graphResponse.json();
  state.graph = graphPayload.graph;
  state.selectedNodeId = state.graph.nodes[0]?.id ?? null;
  state.activeTypes = new Set(state.graph.view.filters);
  renderRun();
}

function renderRun() {
  if (!state.selectedRun || !state.graph) return;
  graphTitle.textContent = state.selectedRun.question;
  renderFilterChips();
  renderInspector();
  renderGraph();
  refreshRuns();
}

function renderFilterChips() {
  filterChips.innerHTML = "";
  for (const type of state.graph.view.filters) {
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

  if (!state.selectedRun || !state.graph) {
    inspectorContent.innerHTML = "<p>No run selected.</p>";
    return;
  }

  if (state.inspectorTab === "metadata") {
    renderMetadataPanel();
    return;
  }
  if (state.inspectorTab === "es_output") {
    renderEsOutputPanel();
    return;
  }
  if (state.inspectorTab === "candidates") {
    renderCandidatesPanel();
    return;
  }
  if (state.inspectorTab === "sources") {
    renderSourcesPanel();
    return;
  }
  renderTracePanel();
}

function renderTracePanel() {
  const selectedArtifact = artifactByStage(state.selectedStage) || state.selectedRun.artifacts?.[state.selectedRun.artifacts.length - 1] || null;
  const traceLayout = document.createElement("div");
  traceLayout.className = "trace-layout";

  const stageColumn = document.createElement("div");
  stageColumn.className = "stage-list";
  for (const stage of state.selectedRun.artifacts) {
    const node = document.createElement("article");
    node.className = "stage-card";
    node.innerHTML = `
      <div class="stage-header">
        <h3>${escapeHtml(stage.stage)}</h3>
        <span class="status-pill ${stage.status}">${statusLabel(stage.status)}</span>
      </div>
      <p>${Object.entries(stage.counts).map(([key, value]) => `${key}: ${value}`).join(" • ") || "no counts"}</p>
    `;
    node.addEventListener("click", () => {
      state.selectedStage = stage.stage;
      renderTracePanel();
    });
    stageColumn.appendChild(node);
  }

  const detailColumn = document.createElement("div");
  detailColumn.className = "trace-samples";
  detailColumn.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Run Trace</h2>
        <p>Representative stage sample plus persistence summary</p>
      </div>
      <span class="status-pill ${selectedArtifact?.status || "ok"}">${statusLabel(selectedArtifact?.status || "ok")}</span>
    </div>
    <div class="persistence-summary">${renderPersistenceSummaryMarkup()}</div>
    <div class="trace-sample-block">
      <h3>${escapeHtml(selectedArtifact?.stage || "artifact")}</h3>
      ${prettyJson(selectedArtifact?.output_sample ?? {})}
    </div>
  `;

  traceLayout.appendChild(stageColumn);
  traceLayout.appendChild(detailColumn);
  inspectorContent.innerHTML = "";
  inspectorContent.appendChild(traceLayout);
}

function renderPersistenceSummaryMarkup() {
  const planArtifact = artifactByStage("persistence_plan");
  const writeArtifact = artifactByStage("typedb_write");
  const summary = planArtifact?.output_sample?.persistence_summary || {};
  const merged = writeArtifact?.output_sample?.merged_entities || [];
  const created = writeArtifact?.output_sample?.created_entities || [];
  const edges = writeArtifact?.output_sample?.created_relations || [];
  const rejected = planArtifact?.output_sample?.rejected_candidates || [];
  const unpersisted = planArtifact?.output_sample?.unpersisted_candidates || [];

  return `
    <article class="summary-card">
      <h3>Decision</h3>
      <p>${escapeHtml(planArtifact?.output_sample?.decision || "n/a")}${planArtifact?.output_sample?.blocked_reason ? ` • ${escapeHtml(planArtifact.output_sample.blocked_reason)}` : ""}</p>
    </article>
    <div class="summary-grid">
      <article class="summary-card"><h3>Merged</h3><p>${merged.length || summary.merged_entities || 0}</p></article>
      <article class="summary-card"><h3>Draft Entities</h3><p>${created.length || summary.draft_entities || 0}</p></article>
      <article class="summary-card"><h3>Draft Edges</h3><p>${edges.length || summary.draft_edges || 0}</p></article>
      <article class="summary-card"><h3>Rejected</h3><p>${rejected.length || summary.rejected_candidates || 0}</p></article>
      <article class="summary-card"><h3>Unpersisted</h3><p>${unpersisted.length || summary.unpersisted_candidates || 0}</p></article>
    </div>
  `;
}

function renderMetadataPanel() {
  const selected = state.graph.nodes.find((node) => node.id === state.selectedNodeId) || state.graph.nodes[0];
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
        <p>Only connected graph nodes render in the primary graph view</p>
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

function renderCandidatesPanel() {
  const candidates = getDebugCandidates();
  if (!candidates.length) {
    inspectorContent.innerHTML = `
      <div class="candidate-empty">
        <h2>Rejected / Unpersisted Candidates</h2>
        <p>No separate debug candidates for this run. The graph view is showing only connected graph state.</p>
      </div>
    `;
    return;
  }

  inspectorContent.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Rejected / Unpersisted Candidates</h2>
        <p>Debug-only candidates kept out of the primary graph</p>
      </div>
    </div>
    <div class="candidate-list">
      ${candidates.map((candidate) => `
        <article class="candidate-card ${escapeHtml(candidate.status)}">
          <div class="candidate-status">
            <span class="status-pill ${escapeHtml(candidate.status)}">${statusLabel(candidate.status)}</span>
          </div>
          <h3>${escapeHtml(candidate.label)}</h3>
          <p>${escapeHtml(candidate.type)}</p>
          <p>${escapeHtml(candidate.metadata_preview?.reason || "no reason provided")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSourcesPanel() {
  const evidenceStage = artifactByStage("evidence");
  const evidencePayload = evidenceStage?.output_sample || {};
  const sources = evidencePayload.sources || {};
  const plan = evidencePayload.plan || null;
  const sourceEntries = Object.entries(sources);

  inspectorContent.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Evidence Sources</h2>
        <p>GPT-planned source queries, request samples, and representative source responses</p>
      </div>
    </div>
    ${plan ? `
      <article class="summary-card">
        <h3>Query Planner</h3>
        <p>${escapeHtml(plan.provider || "unknown")} • ${escapeHtml(plan.planner_status || "unknown")}</p>
        <p>${escapeHtml(plan.summary || "")}</p>
        ${prettyJson({
          interpretations: plan.interpretations || [],
          source_queries: plan.source_queries || {},
        })}
      </article>
    ` : ""}
    <div class="sources-layout">
      ${sourceEntries.map(([key, value]) => {
        const snippet = Array.isArray(value.snippets) && value.snippets[0]
          ? value.snippets[0].snippet
          : (value.detail || "unavailable");
        return `
          <article class="source-card ${value.ok ? "" : "disabled"}">
            <div class="stage-header">
              <h3>${escapeHtml(key)}</h3>
              <span class="status-pill ${value.ok ? "ok" : "warning"}">${value.ok ? "ok" : "warning"}</span>
            </div>
            <p>${escapeHtml(value.ok ? "available" : value.detail || "unavailable")}</p>
            <p>${escapeHtml(snippet || "")}</p>
            ${prettyJson({
              request_sample: value.request_sample || {},
              response_sample: value.response_sample || {},
            })}
          </article>
        `;
      }).join("")}
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
  const properties = Object.entries(entity.properties || {})
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .slice(0, 6);
  return `
    <article class="extract-card">
      <div class="extract-card-header">
        <h4>${escapeHtml(entity.text || entity.label || "Unnamed entity")}</h4>
        <span class="status-pill ok">${escapeHtml(entity.label || "unknown")}</span>
      </div>
      <p>confidence ${Number(entity.confidence || 0).toFixed(2)} • ${escapeHtml((entity.sources || []).join(", ") || "unknown source")}</p>
      ${entity.evidence?.[0] ? `<p>${escapeHtml(entity.evidence[0])}</p>` : ""}
      ${properties.length ? `
        <div class="extract-pill-row">
          ${properties.map(([key, value]) => `<span class="extract-pill">${escapeHtml(key)}: ${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</span>`).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

function renderRelationCard(relation) {
  return `
    <article class="extract-card">
      <div class="extract-card-header">
        <h4>${escapeHtml(relation.type || "relation")}</h4>
        <span class="status-pill ok">${escapeHtml(relation.source_label || "unknown")} → ${escapeHtml(relation.target_label || "unknown")}</span>
      </div>
      <p>${escapeHtml(relation.source_entity || "unknown")} → ${escapeHtml(relation.target_entity || "unknown")}</p>
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

function renderEsOutputPanel() {
  const extractArtifact = artifactByStage("extract");
  const extract = extractArtifact?.output_sample || {};
  const entities = Array.isArray(extract.entities) ? [...extract.entities] : [];
  const relations = Array.isArray(extract.relations) ? [...extract.relations] : [];
  const properties = Array.isArray(extract.properties) ? [...extract.properties] : [];

  if (!entities.length && !relations.length && !properties.length) {
    inspectorContent.innerHTML = `
      <div class="candidate-empty">
        <h2>ES Output</h2>
        <p>No extraction output is available for this run yet.</p>
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
        <h2>ES Output</h2>
        <p>Human-readable list of what the extractor pulled from the collected evidence corpus</p>
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
        <p>Grouped by label</p>
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
        <h3>Relationships</h3>
        <p>What ES thinks is connected to what</p>
      </div>
      <div class="extract-card-list">
        ${relations.length ? relations.map(renderRelationCard).join("") : '<p class="runs-empty">No relations were extracted.</p>'}
      </div>
    </section>
    <section class="extract-section">
      <div class="panel-header">
        <h3>Properties</h3>
        <p>Structured facts ES found while reading the evidence bundle</p>
      </div>
      <div class="extract-card-list">
        ${properties.length ? properties.map(renderPropertyCard).join("") : '<p class="runs-empty">No properties were extracted.</p>'}
      </div>
    </section>
  `;
}

function renderGraph() {
  if (!state.graph) return;

  const container = document.getElementById("graph-canvas");
  container.innerHTML = "";

  const searchTerm = graphSearch.value.trim().toLowerCase();
  const nodes = state.graph.nodes.filter((node) => {
    const typeAllowed = state.activeTypes.has(node.type);
    const searchAllowed = !searchTerm || node.label.toLowerCase().includes(searchTerm);
    const starterAllowed = state.showFullGraph || state.graph.view.focal_ids.includes(node.id) || node.degree_hint > 1;
    return typeAllowed && searchAllowed && starterAllowed;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = state.graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  const width = container.clientWidth;
  const height = container.clientHeight;
  const svg = d3.select(container).append("svg");
  const root = svg.append("g");

  svg.call(d3.zoom().scaleExtent([0.35, 4]).on("zoom", (event) => root.attr("transform", event.transform)));

  const color = d3.scaleOrdinal()
    .domain(["existing", "draft_added"])
    .range(["#8192ae", "#f4b860"]);

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((d) => d.id).distance(110))
    .force("charge", d3.forceManyBody().strength(-280))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(28));

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

refreshRuns();
