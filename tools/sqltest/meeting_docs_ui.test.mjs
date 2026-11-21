import { JSDOM } from "jsdom"; import fs from "fs";
const ROOT = process.argv[2];
const html = fs.readFileSync(ROOT + "/.claude/harness/meeting-test.html", "utf8").replace(/<script src="[^"]+"><\/script>/, "");
const js = fs.readFileSync(ROOT + "/js/meeting-docs.js", "utf8");
const tick = () => new Promise((r) => setTimeout(r, 50));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
async function run(as) {
  const dom = new JSDOM(html, { url: "http://localhost/x.html?as=" + as, runScripts: "dangerously", pretendToBeVisual: true });
  const w = dom.window; w.Response = Response; w.confirm = () => true; w.alert = (m) => w.__log.push("ALERT " + m);
  // 스텁 스크립트가 Response 를 써서 다시 실행
  w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  w.eval(js); for (let i = 0; i < 6; i++) await tick();
  return w;
}
let w = await run("pastor"); let d = w.document;
ok(d.querySelectorAll("#meetingSession .md-item").length === 2, "목사: 당회록 2건");
ok(!!d.querySelector("#meetingSession .md-form"), "목사: 당회록 올리기 양식");
ok(d.querySelector("#yoramArea").textContent.includes("준비 중"), "요람 준비 중 문구");
d.querySelector("#meetingSession .md-dl").click(); await tick(); await tick();
ok(w.__log.some((l) => l.startsWith("OPEN ") && l.includes("download=")), "내려받기: 서명 주소 열기");
const f = d.querySelector("#meetingCongregation .md-form");
f.elements.namedItem("doc_title").value = "2026년 임시 공동의회"; f.elements.namedItem("date").value = "2026-11-20";
Object.defineProperty(f.elements.namedItem("file"), "files", { value: [new w.File(["x"], "회의록.pdf", { type: "application/pdf" })] });
f.dispatchEvent(new w.Event("submit", { cancelable: true })); for (let i = 0; i < 6; i++) await tick();
ok(w.__log.some((l) => /POST .*storage\/v1\/object\/meeting-docs\/congregation\//.test(l)), "올리기: congregation/ 경로로 저장");
ok(d.querySelectorAll("#meetingCongregation .md-item").length === 2, "올린 뒤 공동의회록 2건");
d.querySelector("#meetingSession .md-del").click(); for (let i = 0; i < 6; i++) await tick();
ok(d.querySelectorAll("#meetingSession .md-item").length === 1, "삭제 뒤 당회록 1건");
w = await run("bapt"); d = w.document;
ok(d.querySelector("#meetingSession").textContent.includes("열람 권한이 없습니다") && !d.querySelector("#meetingSession .md-item"), "세례교인: 당회록 잠김");
ok(d.querySelectorAll("#meetingCongregation .md-item").length === 1 && !d.querySelector(".md-form") && !d.querySelector(".md-del"), "세례교인: 공동의회록 열람만");
w = await run("infant"); d = w.document;
ok(d.querySelector("#meetingCongregation").textContent.includes("세례교인"), "유아세례: 공동의회록 잠김 안내");
w = await run("admin"); d = w.document;
ok(!d.querySelector("#meetingSession .md-form") && !!d.querySelector("#meetingCongregation .md-form") && !!d.querySelector("#yoramArea .md-form"), "관리자: 공동의회록·요람 올리기, 당회록 X");
w = await run("out"); d = w.document;
ok(d.querySelectorAll(".md-login").length === 3, "비로그인: 로그인 단추");
console.log(`pass ${pass}, fail ${fail}`);
