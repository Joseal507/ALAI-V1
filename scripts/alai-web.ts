import http from "node:http";
import Database from "better-sqlite3";
import { runAlaiMasterBrain } from "../src/alai/alai-master-brain";

const db = new Database("data/alai.db");
const PORT = Number(process.env.PORT || 8787);

function json(res: http.ServerResponse, data: unknown) {
  res.writeHead(200, { "Content-Type": "application/json" });
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
  const one = (sql: string) => db.prepare(sql).get() as any;
  const all = (sql: string) => db.prepare(sql).all() as any[];

  return {
    counts: {
      concepts: one(`SELECT COUNT(*) count FROM concepts`).count,
      relations: one(`SELECT COUNT(*) count FROM relations`).count,
      evidence: one(`SELECT COUNT(*) count FROM evidence`).count,
      questionsOpen: one(`SELECT COUNT(*) count FROM alai_research_questions WHERE status='OPEN'`).count,
      questionsAnswered: one(`SELECT COUNT(*) count FROM alai_research_questions WHERE status='ANSWERED'`).count,
      mastered: one(`SELECT COUNT(*) count FROM concept_mastery WHERE mastery_score >= 0.82`).count,
      contradictions: one(`SELECT COUNT(*) count FROM alai_quality_flags WHERE status='OPEN'`).count,
    },
    mastery: all(`
      SELECT c.name, c.status, cm.mastery_score mastery, cm.mastery_level level
      FROM concept_mastery cm
      JOIN concepts c ON c.id = cm.concept_id
      ORDER BY cm.mastery_score DESC
      LIMIT 12
    `),
    learning: all(`
      SELECT question_type type, priority_score priority, question
      FROM alai_research_questions
      WHERE status='OPEN'
      ORDER BY priority_score DESC, created_at ASC
      LIMIT 10
    `),
    evidence: all(`
      SELECT source_type type, source_name name, reliability_score reliability
      FROM evidence
      ORDER BY captured_at DESC
      LIMIT 10
    `),
    relations: all(`
      SELECT s.name source, r.relation_type type, t.name target, r.confidence_score confidence
      FROM relations r
      JOIN concepts s ON s.id = r.from_concept_id
      JOIN concepts t ON t.id = r.to_concept_id
      ORDER BY r.created_at DESC
      LIMIT 10
    `),
  };
}

function saveEvidence(conceptId: string | undefined, source: { title: string; url: string; snippet: string }) {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT id FROM evidence WHERE source_url=? LIMIT 1`).get(source.url) as { id: string } | undefined;
  const evidenceId = existing?.id ?? crypto.randomUUID();

  if (!existing) {
    db.prepare(`
      INSERT INTO evidence (id, source_type, source_name, source_url, content_summary, reliability_score, captured_at)
      VALUES (?, 'LIVE_RESEARCH', ?, ?, ?, 0.58, ?)
    `).run(evidenceId, source.title, source.url, source.snippet, now);
  }

  if (conceptId) {
    db.prepare(`
      INSERT OR IGNORE INTO concept_evidence_links (evidence_id, concept_id, confidence_score, created_at)
      VALUES (?, ?, 0.6, ?)
    `).run(evidenceId, conceptId, now);
  }
}

async function answer(message: string) {
  return runAlaiMasterBrain(message);
}

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ALAI Brain</title>
  <style>
    body{margin:0;background:#07070b;color:#f4f4f5;font-family:Inter,system-ui}
    .wrap{max-width:1180px;margin:0 auto;padding:28px}
    .hero{display:grid;grid-template-columns:1.7fr .65fr;gap:18px}
    .card{background:linear-gradient(180deg,#14141d,#0d0d14);border:1px solid #272735;border-radius:24px;padding:20px;box-shadow:0 20px 60px #0008}
    h1{margin:0 0 8px;font-size:42px}
    .muted{color:#a1a1aa}
    #chat{height:560px;overflow:auto;background:#09090f;border:1px solid #252532;border-radius:18px;padding:16px;margin:14px 0}
    .msg{white-space:pre-wrap;margin:12px 0;padding:14px;border-radius:16px;line-height:1.45}
    .user{background:#1e293b;margin-left:18%}
    .ai{background:#111827;margin-right:10%;border:1px solid #293244}
    .row{display:flex;gap:10px}
    input{flex:1;background:#09090f;color:white;border:1px solid #30303d;border-radius:14px;padding:14px;font-size:15px}
    button{background:#f5c542;border:0;border-radius:14px;padding:0 18px;font-weight:800;cursor:pointer}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}
    .stat{background:#09090f;border:1px solid #262633;border-radius:18px;padding:16px}
    .stat b{font-size:28px;color:#f5c542}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:18px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    td,th{border-bottom:1px solid #242432;padding:9px;text-align:left}
    th{color:#f5c542}
    .pill{display:inline-block;padding:5px 9px;border:1px solid #333;border-radius:999px;color:#f5c542;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="card">
        <h1>ALAI</h1>
        <div class="muted">Chat principal · ALAI responde, razona, investiga, aprende y actualiza su cerebro.</div>
        <div id="chat"></div>
        <div class="row">
          <input id="input" placeholder="Pregúntale algo a ALAI..." />
          <button onclick="send()">Enviar</button>
        </div>
      </div>
      <div class="card">
        <h2>Estado del cerebro</h2>
        <div id="stats" class="stats"></div>
      </div>
    </div>

    <div class="grid">
      <div class="card"><h2>Lo que más domina</h2><div id="mastery"></div></div>
      <div class="card"><h2>Lo que está aprendiendo</h2><div id="learning"></div></div>
      <div class="card"><h2>Evidencia reciente</h2><div id="evidence"></div></div>
      <div class="card"><h2>Relaciones nuevas</h2><div id="relations"></div></div>
    </div>
  </div>

<script>
const chat = document.getElementById("chat");
const input = document.getElementById("input");

function add(cls, text){
  const div=document.createElement("div");
  div.className="msg "+cls;
  div.textContent=text;
  chat.appendChild(div);
  chat.scrollTop=chat.scrollHeight;
}

async function send(){
  const message=input.value.trim();
  if(!message)return;
  input.value="";
  add("user", message);
  add("ai", "ALAI está pensando...");
  const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
  const data=await res.json();
  chat.lastChild.textContent=data.answer+"\\n\\nConfianza: "+Number(data.confidence).toFixed(3)+(data.sources?.length?"\\nFuentes: "+data.sources.join(", "):"");
  load();
}

function table(rows, cols){
  if(!rows.length)return "<div class='muted'>Nada todavía.</div>";
  return "<table><tr>"+cols.map(c=>"<th>"+c+"</th>").join("")+"</tr>"+
    rows.map(r=>"<tr>"+cols.map(c=>"<td>"+(r[c]??"")+"</td>").join("")+"</tr>").join("")+"</table>";
}

async function load(){
  const data=await (await fetch("/api/stats")).json();
  document.getElementById("stats").innerHTML=Object.entries(data.counts).map(([k,v])=>"<div class='stat'><b>"+v+"</b><div>"+k+"</div></div>").join("");
  document.getElementById("mastery").innerHTML=table(data.mastery,["name","status","mastery","level"]);
  document.getElementById("learning").innerHTML=table(data.learning,["type","priority","question"]);
  document.getElementById("evidence").innerHTML=table(data.evidence,["type","name","reliability"]);
  document.getElementById("relations").innerHTML=table(data.relations,["source","type","target","confidence"]);
}
input.addEventListener("keydown",e=>{if(e.key==="Enter")send()});
load();
add("ai","Soy ALAI. Puedo responder, calcular, investigar y aprender. Pregúntame algo.");
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  if (req.url === "/api/stats") {
    json(res, stats());
    return;
  }

  if (req.url === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const result = await answer(String(body.message || ""));
    json(res, result);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`ALAI Brain running at http://localhost:${PORT}`);
});
