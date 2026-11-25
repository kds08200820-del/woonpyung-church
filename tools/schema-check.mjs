// 운평장로교회 — supabase/ 의 SQL 파일이 실제 DB 에 실행됐는지 견줘 본다 (2026-11-25)
//
//   node tools/schema-check.mjs                 # DB 에서 구조 목록을 받아 견준다(SUPABASE_SERVICE_ROLE_KEY 필요, 이름만 받는다)
//   node tools/schema-check.mjs --catalog x.json # 받아 둔 목록(select public.schema_catalog(); 의 결과)으로 견준다
//   node tools/schema-check.mjs --all           # 다 실행된 파일도 함께 보인다
//
//   파일마다 그 파일이 만드는 이름(함수 · 표 · 칸 · 트리거 · 정책 · 색인)을 뽑아 DB 목록에 있는지 본다.
//   · 「실행됨」     : 만드는 것이 모두 DB 에 있거나 schema_log 에 기록이 있다
//   · 「일부만」     : 일부만 있다 — 뒤 파일이 이름을 바꿨거나, 이 파일이 실행되지 않았을 수 있다
//   · 「안 된 듯」   : 하나도 없다
//   · 「알 수 없음」 : 만드는 이름을 찾지 못했다(데이터만 고치는 파일 등)
//   자료는 받지 않는다(이름만). 판단은 짐작이므로 「일부만 · 안 된 듯」 파일은 사람이 열어 확인한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUP = path.join(REPO, "supabase");
const args = process.argv.slice(2);
const showAll = args.includes("--all");
const ci = args.indexOf("--catalog");

export function objectsOf(sql) {
  // 주석을 빼고 본다(되돌리는 법에 적힌 drop/rename 이름이 섞이지 않게)
  const s = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").toLowerCase();
  const out = { functions: new Set(), tables: new Set(), columns: new Set(), triggers: new Set(), policies: new Set(), indexes: new Set() };
  const id = "\"?([a-z_][a-z0-9_]*)\"?";
  let m;
  const fre = new RegExp("create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?" + id, "g");
  while ((m = fre.exec(s))) out.functions.add(m[1]);
  const tre = new RegExp("create\\s+(?:table|view|materialized\\s+view)\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?" + id, "g");
  while ((m = tre.exec(s))) out.tables.add(m[1]);
  const are = new RegExp("alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?" + id + "([^;]*)", "g");
  while ((m = are.exec(s))) {
    const cre = new RegExp("add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?" + id, "g");
    let c; while ((c = cre.exec(m[2]))) out.columns.add(m[1] + "." + c[1]);
  }
  // 대상 표가 public 이 아닌 것(storage · auth 의 정책 · 트리거 등)은 이 목록에 없으므로 빼고 본다
  const pub = (schema) => !schema || schema === "public";
  const gre = /create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z_][a-z0-9_]*)"?[\s\S]*?\son\s+(?:"?([a-z_]+)"?\.)?"?[a-z_][a-z0-9_]*/g;
  while ((m = gre.exec(s))) if (pub(m[2])) out.triggers.add(m[1]);
  const pre = /create\s+policy\s+"([^"]+)"\s+on\s+(?:"?([a-z_]+)"?\.)?"?([a-z_][a-z0-9_]*)"?/g;
  while ((m = pre.exec(s))) if (pub(m[2]) && !m[1].includes("%")) out.policies.add(m[3] + "." + m[1]);
  const pre2 = /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+(?:"?([a-z_]+)"?\.)?"?([a-z_][a-z0-9_]*)"?/g;
  while ((m = pre2.exec(s))) if (pub(m[2])) out.policies.add(m[3] + "." + m[1]);
  const ire = /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\s+on\s+(?:only\s+)?(?:"?([a-z_]+)"?\.)?/g;
  while ((m = ire.exec(s))) if (pub(m[2])) out.indexes.add(m[1]);
  return out;
}

export function judge(file, objs, cat) {
  const sets = {
    functions: new Set(cat.functions), tables: new Set(cat.tables), columns: new Set(cat.columns),
    triggers: new Set(cat.triggers), policies: new Set((cat.policies || []).map((p) => p.toLowerCase())), indexes: new Set(cat.indexes),
  };
  const logged = new Set((cat.logged || []).map((l) => l.file));
  let have = 0, total = 0; const missing = [];
  for (const k of Object.keys(objs)) for (const name of objs[k]) {
    total++;
    if (sets[k].has(name)) have++; else missing.push(k.slice(0, -1) + " " + name);
  }
  let state;
  if (logged.has(file)) state = "실행됨";
  else if (!total) state = "알 수 없음";
  else if (have === total) state = "실행됨";
  else if (have === 0) state = "안 된 듯";
  else state = "일부만";
  return { file, state, have, total, missing, logged: logged.has(file) };
}

async function loadCatalog() {
  if (ci >= 0) return JSON.parse(fs.readFileSync(args[ci + 1], "utf8"));
  const url = (process.env.SUPABASE_URL || "https://cetacttsdwzxjzkyozgd.supabase.co").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 없습니다(또는 --catalog 파일을 주세요).");
  const r = await fetch(url + "/rest/v1/rpc/schema_catalog", { method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("schema_catalog → HTTP " + r.status + " " + (await r.text()).slice(0, 200) + " (supabase/20261125_1000_schema_log.sql 을 먼저 실행)");
  return r.json();
}

async function main() {
  const cat = await loadCatalog();
  const files = fs.readdirSync(SUP).filter((f) => f.endsWith(".sql")).sort();
  const rows = files.map((f) => judge(f, objectsOf(fs.readFileSync(path.join(SUP, f), "utf8")), cat));
  const count = {}; rows.forEach((r) => { count[r.state] = (count[r.state] || 0) + 1; });
  for (const r of rows) {
    if (!showAll && (r.state === "실행됨" || r.state === "알 수 없음")) continue;
    console.log(`${r.state.padEnd(5)}  ${r.file}  (${r.have}/${r.total})${r.missing.length ? "  없음: " + r.missing.slice(0, 6).join(", ") + (r.missing.length > 6 ? " …" : "") : ""}`);
  }
  console.log("\n" + Object.entries(count).map(([k, v]) => `${k} ${v}`).join(" · ") + `  (파일 ${files.length}개, 기록 ${(cat.logged || []).length}개)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("✖ " + (e.message || e)); process.exit(1); });
}
