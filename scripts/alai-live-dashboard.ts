import http from "node:http";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const PORT = 4444;
const DB_PATH = "data/alai.db";

function db() {
  return new Database(DB_PATH);
}

function q<T = any>(sql: string, params: any[] = []): T[] {
  const conn = db();
  try {
    return conn.prepare(sql).all(...params) as T[];
  } catch {
    return [];
  } finally {
    conn.close();
  }
}

function one<T = any>(sql: string, params: any[] = []): T {
  const conn = db();
  try {
    return conn.prepare(sql).get(...params) as T;
  } catch {
    return {} as T;
  } finally {
    conn.close();
  }
}

function count(sql: string): number {
  return Number((one(sql) as any)?.n ?? 0);
}

function json(res: http.ServerResponse, data: unknown) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { resolve({}); }
    });
  });
}

function stats() {
  const conceptsByStatus = q(`
    SELECT status, COUNT(*) AS count
    FROM concepts
    GROUP BY status
    ORDER BY count DESC
  `);

  const health = {
    concepts: count(`SELECT COUNT(*) AS n FROM concepts`),
    relations: count(`SELECT COUNT(*) AS n FROM relations`),
    beliefs: count(`SELECT COUNT(*) AS n FROM alai_beliefs`),
    memories: count(`SELECT COUNT(*) AS n FROM alai_episodic_memories`),
    openFlags: count(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
    openResearch: count(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
    answeredResearch: count(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='ANSWERED'`),
    v6Patterns: count(`SELECT COUNT(*) AS n FROM alai_v6_conversation_patterns`),
    v6Reasoning: count(`SELECT COUNT(*) AS n FROM alai_v6_reasoning_frameworks`),
    v6Agents: count(`SELECT COUNT(*) AS n FROM alai_v6_agent_goals`),
    v5ImpactLinks: count(`SELECT COUNT(*) AS n FROM alai_v5_curriculum_impact_links`)
  };

  const domainCoverage = q(`
    SELECT d.name, ROUND(r.rollup_coverage_score,3) AS coverage
    FROM domain_coverage_rollup r
    JOIN academic_domains d ON d.id=r.domain_id
    ORDER BY r.rollup_coverage_score ASC
    LIMIT 12
  `);

  const recentLearning = q(`
    SELECT question_type, status, COUNT(*) AS count
    FROM alai_research_questions
    GROUP BY question_type, status
    ORDER BY count DESC
    LIMIT 12
  `);

  const recentMemories = q(`
    SELECT title, lesson, importance_score
    FROM alai_episodic_memories
    ORDER BY created_at DESC
    LIMIT 6
  `);

  const ratings = {
    architecture: 97,
    autonomy: health.openFlags === 0 && health.openResearch === 0 ? 95 : 84,
    governance: health.openFlags === 0 ? 96 : 80,
    curriculum: health.v5ImpactLinks >= 1000 ? 93 : 85,
    domainImpact: health.v5ImpactLinks >= 1000 ? 78 : 55,
    conversation: health.v6Patterns >= 7 ? 90 : 70,
    reasoning: health.v6Reasoning >= 7 ? 92 : 74,
    agents: health.v6Agents >= 3 ? 95 : 80
  };

  const global = Math.round(
    Object.values(ratings).reduce((a: number, b: number) => a + Number(b), 0)
    / Object.keys(ratings).length
  );

  return {
    now: new Date().toISOString(),
    health,
    conceptsByStatus,
    domainCoverage,
    recentLearning,
    recentMemories,
    ratings: { ...ratings, global }
  };
}

function chat(question: string) {
  const result = spawnSync(
    "npm",
    ["run", "alai:v15-answer", "--", question],
    { encoding: "utf8", timeout: 45000 }
  );

  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();

  return {
    ok: result.status === 0,
    answer: output || "ALAI no devolvió respuesta.",
    status: result.status
  };
}

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ALAI Live Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg:#07070b;
      --panel:#11111a;
      --panel2:#171724;
      --gold:#f5c542;
      --red:#ff3b5f;
      --cyan:#35d7ff;
      --pink:#ff5de4;
      --text:#f7f7fb;
      --muted:#9ca3af;
      --line:rgba(255,255,255,.08);
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      background:
        radial-gradient(circle at top left, rgba(255,59,95,.18), transparent 28%),
        radial-gradient(circle at top right, rgba(53,215,255,.14), transparent 30%),
        radial-gradient(circle at bottom, rgba(255,93,228,.12), transparent 25%),
        var(--bg);
      color:var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Arial;
    }
    header {
      padding:22px 28px;
      border-bottom:1px solid var(--line);
      display:flex;
      justify-content:space-between;
      align-items:center;
      background:rgba(0,0,0,.22);
      backdrop-filter: blur(12px);
      position:sticky;
      top:0;
      z-index:10;
    }
    h1 { margin:0; font-size:24px; letter-spacing:.5px; }
    .badge {
      border:1px solid rgba(245,197,66,.45);
      color:var(--gold);
      padding:8px 12px;
      border-radius:999px;
      font-weight:700;
      background:rgba(245,197,66,.08);
    }
    .wrap { padding:24px; max-width:1500px; margin:0 auto; }
    .chat {
      background:linear-gradient(135deg, rgba(245,197,66,.12), rgba(53,215,255,.08), rgba(255,93,228,.08));
      border:1px solid var(--line);
      border-radius:22px;
      padding:18px;
      margin-bottom:20px;
      box-shadow:0 18px 60px rgba(0,0,0,.35);
    }
    .chat h2 { margin:0 0 12px; color:var(--gold); }
    .chatbox {
      display:flex;
      gap:10px;
    }
    input {
      flex:1;
      padding:15px 16px;
      border-radius:14px;
      border:1px solid var(--line);
      background:#080812;
      color:var(--text);
      outline:none;
      font-size:15px;
    }
    button {
      border:0;
      border-radius:14px;
      padding:14px 20px;
      font-weight:800;
      background:linear-gradient(135deg, var(--red), var(--pink), var(--cyan));
      color:white;
      cursor:pointer;
      box-shadow:0 8px 30px rgba(255,59,95,.22);
    }
    pre {
      white-space:pre-wrap;
      background:rgba(0,0,0,.35);
      border:1px solid var(--line);
      padding:14px;
      border-radius:14px;
      max-height:360px;
      overflow:auto;
      color:#e8e8f0;
    }
    .grid {
      display:grid;
      grid-template-columns: repeat(4, minmax(0,1fr));
      gap:16px;
    }
    .card {
      background:linear-gradient(180deg, var(--panel), var(--panel2));
      border:1px solid var(--line);
      border-radius:20px;
      padding:18px;
      min-height:120px;
      box-shadow:0 12px 40px rgba(0,0,0,.28);
    }
    .card h3 {
      margin:0 0 8px;
      color:var(--muted);
      font-size:13px;
      text-transform:uppercase;
      letter-spacing:.12em;
    }
    .big {
      font-size:34px;
      font-weight:900;
      color:var(--gold);
    }
    .cyan { color:var(--cyan); }
    .red { color:var(--red); }
    .pink { color:var(--pink); }
    .charts {
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:16px;
      margin-top:16px;
    }
    canvas { max-height:310px; }
    table {
      width:100%;
      border-collapse:collapse;
      font-size:14px;
    }
    td,th {
      padding:10px;
      border-bottom:1px solid var(--line);
    }
    th { color:var(--gold); text-align:left; }
    .section-title {
      margin:26px 0 12px;
      color:var(--gold);
    }
    @media(max-width:1000px){
      .grid,.charts{grid-template-columns:1fr;}
      .chatbox{flex-direction:column;}
    }
  </style>
</head>
<body>
<header>
  <h1>ALAI Live Learning Dashboard</h1>
  <div class="badge" id="globalBadge">Global --</div>
</header>

<div class="wrap">
  <section class="chat">
    <h2>Chat con ALAI</h2>
    <div class="chatbox">
      <input id="question" placeholder="Pregúntale algo a ALAI..." />
      <button onclick="ask()">Preguntar</button>
    </div>
    <pre id="answer">Aquí aparecerá la respuesta de ALAI.</pre>
  </section>

  <div class="grid">
    <div class="card"><h3>Conceptos</h3><div class="big" id="concepts">--</div></div>
    <div class="card"><h3>Relaciones</h3><div class="big cyan" id="relations">--</div></div>
    <div class="card"><h3>Creencias</h3><div class="big pink" id="beliefs">--</div></div>
    <div class="card"><h3>Memorias</h3><div class="big red" id="memories">--</div></div>
    <div class="card"><h3>Open Research</h3><div class="big" id="openResearch">--</div></div>
    <div class="card"><h3>Open Flags</h3><div class="big" id="openFlags">--</div></div>
    <div class="card"><h3>Impact Links</h3><div class="big cyan" id="impactLinks">--</div></div>
    <div class="card"><h3>Answered Research</h3><div class="big pink" id="answeredResearch">--</div></div>
  </div>

  <div class="charts">
    <div class="card">
      <h3>Estados de conceptos</h3>
      <canvas id="conceptChart"></canvas>
    </div>
    <div class="card">
      <h3>Ratings ALAI</h3>
      <canvas id="ratingsChart"></canvas>
    </div>
  </div>

  <div class="charts">
    <div class="card">
      <h3>Cobertura por dominio</h3>
      <canvas id="domainChart"></canvas>
    </div>
    <div class="card">
      <h3>Research por tipo</h3>
      <canvas id="researchChart"></canvas>
    </div>
  </div>

  <h2 class="section-title">Qué está aprendiendo / recordando</h2>
  <div class="card">
    <table>
      <thead><tr><th>Memoria</th><th>Lección</th><th>Importancia</th></tr></thead>
      <tbody id="memTable"></tbody>
    </table>
  </div>
</div>

<script>
let conceptChart, ratingsChart, domainChart, researchChart;

function makeChart(ctx, type, labels, data) {
  return new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        borderWidth: 2
      }]
    },
    options: {
      responsive:true,
      plugins:{ legend:{ labels:{ color:'#f7f7fb' } } },
      scales: type === 'doughnut' ? {} : {
        x:{ ticks:{ color:'#cbd5e1' }, grid:{ color:'rgba(255,255,255,.06)' } },
        y:{ ticks:{ color:'#cbd5e1' }, grid:{ color:'rgba(255,255,255,.06)' } }
      }
    }
  });
}

function updateChart(oldChart, id, type, labels, data) {
  if (oldChart) oldChart.destroy();
  return makeChart(document.getElementById(id), type, labels, data);
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const s = await res.json();

  document.getElementById('concepts').textContent = s.health.concepts;
  document.getElementById('relations').textContent = s.health.relations;
  document.getElementById('beliefs').textContent = s.health.beliefs;
  document.getElementById('memories').textContent = s.health.memories;
  document.getElementById('openResearch').textContent = s.health.openResearch;
  document.getElementById('openFlags').textContent = s.health.openFlags;
  document.getElementById('impactLinks').textContent = s.health.v5ImpactLinks;
  document.getElementById('answeredResearch').textContent = s.health.answeredResearch;
  document.getElementById('globalBadge').textContent = 'Global ' + s.ratings.global + '/100';

  conceptChart = updateChart(
    conceptChart,
    'conceptChart',
    'doughnut',
    s.conceptsByStatus.map(x => x.status),
    s.conceptsByStatus.map(x => x.count)
  );

  ratingsChart = updateChart(
    ratingsChart,
    'ratingsChart',
    'bar',
    Object.keys(s.ratings),
    Object.values(s.ratings)
  );

  domainChart = updateChart(
    domainChart,
    'domainChart',
    'bar',
    s.domainCoverage.map(x => x.name),
    s.domainCoverage.map(x => x.coverage)
  );

  researchChart = updateChart(
    researchChart,
    'researchChart',
    'bar',
    s.recentLearning.map(x => x.question_type + ' / ' + x.status),
    s.recentLearning.map(x => x.count)
  );

  document.getElementById('memTable').innerHTML = s.recentMemories.map(m =>
    '<tr><td>' + (m.title || '') + '</td><td>' + (m.lesson || '') + '</td><td>' + (m.importance_score || '') + '</td></tr>'
  ).join('');
}

async function ask() {
  const q = document.getElementById('question').value.trim();
  if (!q) return;
  const answer = document.getElementById('answer');
  answer.textContent = 'ALAI está pensando...';

  const res = await fetch('/api/chat', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ question:q })
  });

  const data = await res.json();
  answer.textContent = data.answer;
  loadStats();
}

loadStats();
setInterval(loadStats, 5000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.url === "/api/stats") {
    json(res, stats());
    return;
  }

  if (req.url === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    json(res, chat(String(body.question || "")));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log("ALAI LIVE DASHBOARD");
  console.log("http://localhost:" + PORT);
  console.log("======================================");
  console.log("");
});
