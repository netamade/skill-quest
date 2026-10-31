"use strict";
/* Knowledge test engine v0.2: practice mode (immediate feedback) + ui_spot flow canvas
   + attempt records (localStorage) + domain mastery map + JSON export.
   Data: window.KT_DATA = { blueprism: {config, bank}, asteria: {config, bank} }
   Judgement: config.judgement (weighted recent-window accuracy, decay, min evidence). */
(function () {
  const app = document.getElementById("app");
  const state = { product: "blueprism", view: "quiz", mode: "practice", filter: null, session: [], idx: 0, score: 0, answered: 0, picked: null, pickedReason: null, locked: false, exam: null, timerId: null };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const data = () => window.KT_DATA[state.product];
  const allQuestions = () => data().bank.questions;
  const domainName = (code) => {
    const d = data().config.domains.find((x) => x.code === code);
    return d ? d.name : code;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  /* ---------- records (localStorage, key kt:{productId}:v1) ---------- */
  const storeKey = () => "kt:" + state.product + ":v1";
  const memFallback = {};
  function loadRecords() {
    try {
      const raw = (typeof localStorage !== "undefined" && localStorage.getItem(storeKey())) || memFallback[storeKey()];
      if (raw) { const p = JSON.parse(raw); if (p && p.attempts) return p; }
    } catch (e) { /* fall through to empty */ }
    return { v: 1, attempts: {} };
  }
  function saveRecords(rec) {
    const raw = JSON.stringify(rec);
    memFallback[storeKey()] = raw;
    try { if (typeof localStorage !== "undefined") localStorage.setItem(storeKey(), raw); } catch (e) { /* in-memory only */ }
  }
  function recordAttempt(q, correct, mode) {
    const rec = loadRecords();
    const list = rec.attempts[q.id] || (rec.attempts[q.id] = []);
    list.push({ t: Date.now(), ok: !!correct, mode: mode || "practice" });
    if (list.length > 60) list.splice(0, list.length - 60);
    saveRecords(rec);
  }

  /* ---------- judgement (per domain) ---------- */
  function domainStats(code) {
    const cfg = data().config.judgement;
    const qs = allQuestions().filter((q) => q.domain === code);
    const rec = loadRecords();
    const ev = [];
    qs.forEach((q) => (rec.attempts[q.id] || []).forEach((a) => { if (!cfg.excludeModes.includes(a.mode)) ev.push(a); }));
    ev.sort((a, b) => a.t - b.t);
    const win = ev.slice(-cfg.window);
    let wsum = 0, wacc = 0;
    win.forEach((a, i) => { const w = Math.pow(cfg.decay, win.length - 1 - i); wsum += w; if (a.ok) wacc += w; });
    const weighted = wsum > 0 ? wacc / wsum : null;
    const attempted = new Set(qs.filter((q) => (rec.attempts[q.id] || []).length > 0).map((q) => q.id)).size;
    const coverage = qs.length ? attempted / qs.length : 0;
    let stage;
    if (ev.length === 0) stage = cfg.labels[0];
    else if (win.length < cfg.minEvidence) stage = cfg.labels[1];
    else if (weighted >= cfg.thresholds.master && coverage >= cfg.coverageForTop) stage = cfg.labels[3];
    else if (weighted >= cfg.thresholds.stable) stage = cfg.labels[2];
    else stage = cfg.labels[1];
    return { attempts: ev.length, evidence: win.length, weighted, coverage, stage, total: qs.length, attempted };
  }

  /* ---------- sessions ---------- */
  function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }

  function startSession(filter) {
    stopTimer();
    state.mode = "practice"; state.exam = null;
    state.filter = filter || null;
    // Practice order is shuffled on every session start (product tab, domain pick, restart)
    // so a fresh question greets the learner each time — at eguchi's request, 2026-10-31.
    state.session = shuffle(filter ? allQuestions().filter((q) => q.domain === filter) : allQuestions());
    state.idx = 0; state.score = 0; state.answered = 0; state.view = "quiz";
    render();
  }

  function header() {
    const c = data().config;
    const tabs = Object.keys(window.KT_DATA).map((pid) =>
      `<button data-prod="${pid}" class="${state.product === pid ? "on" : ""}">${esc(window.KT_DATA[pid].config.displayName)}</button>`).join("");
    return `<div class="bar">
      <div class="tabs">${tabs}</div>
      <div class="bar2">
        <button data-view="map" class="ghost">分野マップ</button>
        <span class="score">正解 ${state.score} / 回答 ${state.answered}</span>
      </div>
    </div>
    <p class="disc">${esc(c.disclaimer)}（試作版）</p>`;
  }

  function render() {
    if (state.view === "map") { renderMap(); return; }
    if (state.mode === "exam") { renderExam(); return; }
    const qs = state.session.length ? state.session : allQuestions();
    if (state.idx >= qs.length) {
      app.innerHTML = header() + `<div class="card"><h2>チャレンジ完了！</h2>
        <p>${qs.length}問中 ${state.score}問正解でした。</p>
        <p class="src">到達度は分野マップに記録されています。</p>
        <button id="restart">最初から</button>
        <button data-view="map" class="ghost">分野マップを見る</button></div>`;
      bindHeader();
      document.getElementById("restart").onclick = () => startSession(null);
      return;
    }
    const q = qs[state.idx];
    state.picked = null; state.pickedReason = null; state.locked = false;
    let body = "";
    if (q.type === "ui_spot") body = flowSvg(q.ui.flow) + `<p class="sel" id="selLabel">ノードをクリックして選んでください</p>`;
    if (q.type === "screen_spot") body = screenHtml(q, null) + `<p class="sel" id="selLabel">誤っていると思う行をクリックして選んでください</p>`;
    const shown = q.shuffle ? shuffle(q.choices) : q.choices;
    const choices = shown.map((c) =>
      `<button class="choice" data-choice="${esc(c.id)}">${esc(c.text)}</button>`).join("");
    app.innerHTML = header() + `<div class="card">
      <div class="meta">${esc(domainName(q.domain))} ｜ ${state.idx + 1} / ${qs.length}問 ｜ ${q.type === "ui_spot" || q.type === "screen_spot" ? "画面再現問題（誤り探し）" : "四択"}</div>
      <h2 class="stem">${esc(q.stem)}</h2>
      ${body}
      <div class="choices">${choices}</div>
      <button id="answerBtn" disabled>回答する</button>
      <div id="feedback"></div>
    </div>`;
    bindHeader();
    app.querySelectorAll("[data-choice]").forEach((b) => {
      b.onclick = () => {
        if (state.locked) return;
        if (q.type === "ui_spot" || q.type === "screen_spot") state.pickedReason = b.dataset.choice; else state.picked = b.dataset.choice;
        app.querySelectorAll("[data-choice]").forEach((x) => x.classList.toggle("picked", x === b));
        updateAnswerBtn(q);
      };
    });
    document.getElementById("answerBtn").onclick = () => grade(q);
    if (q.type === "ui_spot") bindFlow(q);
    if (q.type === "screen_spot") bindScreen(q);
  }

  function stageClass(stage) {
    return { "未着手": "st0", "挑戦中": "st1", "安定": "st2", "マスター": "st3" }[stage] || "st0";
  }

  function renderMap() {
    const cfg = data().config;
    const rows = cfg.domains.map((d) => {
      const s = domainStats(d.code);
      const pct = s.weighted == null ? "—" : Math.round(s.weighted * 100) + "%";
      const hint = s.evidence < cfg.judgement.minEvidence && s.attempts > 0
        ? `判定まであと${cfg.judgement.minEvidence - s.evidence}回答` : `問題${s.total}問`;
      return `<div class="drow">
        <div class="dmain"><span class="dname">${esc(d.name)}</span>
        <span class="chip ${stageClass(s.stage)}">${esc(s.stage)}</span></div>
        <div class="dsub">正答率（直近加重） ${pct} ｜ 回答 ${s.attempts} ｜ ${esc(hint)}</div>
        <button data-domain="${esc(d.code)}" class="ghost">この分野を練習</button>
      </div>`;
    }).join("");
    app.innerHTML = header() + `<div class="card"><h2>分野マップ（${esc(cfg.displayName)}）</h2>
      <p class="src">到達度は直近${cfg.judgement.window}回答の加重正答率で判定します（${cfg.judgement.minEvidence}回答から判定）。記録はこのブラウザに保存されます。</p>
      ${rows}
      <div class="mapbtns">
        <button id="allPractice">全分野を練習</button>
        ${examButtonHtml()}
        <button data-export="1" class="ghost">記録をエクスポート（JSON）</button>
      </div>
      <div id="exportBox"></div>
    </div>`;
    bindHeader();
    app.querySelectorAll("[data-domain]").forEach((b) => { b.onclick = () => startSession(b.dataset.domain); });
    const ap = document.getElementById("allPractice");
    if (ap) ap.onclick = () => startSession(null);
    const xb = app.querySelectorAll("[data-exam]")[0];
    if (xb) xb.onclick = () => startExam(xb.dataset.exam);
    const ex = app.querySelectorAll("[data-export]")[0];
    if (ex) ex.onclick = exportRecords;
  }

  /* ---------- exam mode (BP: mock / AW: cross) ---------- */
  function examSpec() {
    const modes = data().config.modes;
    if (modes.mock) return { kind: "mock", cfg: modes.mock };
    if (modes.cross) return { kind: "cross", cfg: modes.cross };
    return null;
  }
  function examButtonHtml() {
    const spec = examSpec();
    if (!spec) return "";
    const avail = allQuestions().length;
    const want = spec.kind === "mock" ? spec.cfg.count : spec.cfg.count[0];
    const short = avail < want ? `（現在${avail}問のため短縮版で実施）` : "";
    return `<button data-exam="${spec.kind}">${esc(spec.cfg.label)}${short}</button>`;
  }
  function startExam(kind) {
    const spec = examSpec();
    if (!spec || spec.kind !== kind) return;
    const want = kind === "mock" ? spec.cfg.count : spec.cfg.count[0];
    const pool = shuffle(allQuestions());
    const picked = pool.slice(0, Math.min(want, pool.length));
    const fullSec = kind === "mock" ? spec.cfg.timeLimitSec : null;
    const limitSec = fullSec ? Math.round(fullSec * picked.length / spec.cfg.count) : null;
    stopTimer();
    state.mode = "exam"; state.view = "quiz"; state.filter = null;
    state.session = picked; state.idx = 0; state.score = 0; state.answered = 0;
    state.exam = { kind, cfg: spec.cfg, startTs: Date.now(), limitSec, answers: {}, flags: {}, finished: false, result: null };
    if (limitSec && typeof setInterval !== "undefined") {
      state.timerId = setInterval(tickTimer, 1000);
    }
    render();
  }
  function examElapsedSec() { return state.exam ? Math.floor((Date.now() - state.exam.startTs) / 1000) : 0; }
  function fmtClock(sec) {
    const s = Math.max(0, sec);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function tickTimer() {
    const el = document.getElementById("timer");
    if (!state.exam || state.exam.finished) { stopTimer(); return; }
    if (el) el.textContent = timerText();
    if (state.exam.limitSec && examElapsedSec() >= state.exam.limitSec) finishExam();
  }
  function timerText() {
    if (!state.exam) return "";
    if (!state.exam.limitSec) return "経過 " + fmtClock(examElapsedSec());
    return "残り " + fmtClock(state.exam.limitSec - examElapsedSec());
  }
  function gradeExamQuestion(q, ans) {
    if (!ans) return false;
    if (q.type === "ui_spot" || q.type === "screen_spot") {
      let locOk;
      if (q.type === "screen_spot" && q.answer.length === 0) locOk = ans.node === "__none__";
      else locOk = q.answer.includes(ans.node) || ((q.ui && q.ui.accept) || []).includes(ans.node);
      const reasonOk = ans.reason === "r1";
      return locOk && reasonOk;
    }
    return q.answer.includes(ans.choice);
  }
  function renderExam() {
    const ex = state.exam;
    const qs = state.session;
    if (!ex || ex.finished) { renderExamResult(); return; }
    const q = qs[state.idx];
    const ans = ex.answers[q.id] || {};
    let body = "";
    if (q.type === "ui_spot") body = flowSvg(q.ui.flow) + `<p class="sel" id="selLabel">${ans.node ? "選択中：" + esc((q.ui.flow.nodes.find((n) => n.id === ans.node) || {}).label || ans.node) : "ノードをクリックして選んでください"}</p>`;
    if (q.type === "screen_spot") body = screenHtml(q, ans.node || null);
    const shown = q.shuffle ? q.choices : q.choices;
    const choices = shown.map((c) => {
      const picked = q.type === "ui_spot" || q.type === "screen_spot" ? ans.reason === c.id : ans.choice === c.id;
      return `<button class="choice ${picked ? "picked" : ""}" data-choice="${esc(c.id)}">${esc(c.text)}</button>`;
    }).join("");
    const answeredCount = qs.filter((x) => {
      const a = ex.answers[x.id];
      return a && (x.type === "ui_spot" || x.type === "screen_spot" ? (a.node && a.reason) : a.choice);
    }).length;
    app.innerHTML = header() + `<div class="card">
      <div class="meta">${esc(ex.cfg.label)} ｜ ${state.idx + 1} / ${qs.length}問 ｜ 回答済み ${answeredCount} ｜ <span id="timer">${esc(timerText())}</span></div>
      <h2 class="stem">${esc(q.stem)}</h2>
      ${body}
      <div class="choices">${choices}</div>
      <div class="examnav">
        <button data-nav="prev" class="ghost" ${state.idx === 0 ? "disabled" : ""}>前へ</button>
        <button data-flag="1" class="ghost">${ex.flags[q.id] ? "★ 見直しフラグを外す" : "☆ 後で見直す"}</button>
        <button data-nav="next" class="ghost" ${state.idx + 1 >= qs.length ? "disabled" : ""}>次へ</button>
        <button data-finish="1">終了する</button>
      </div>
      <p class="src">試験中は解説を表示しません。回答は後から変更できます。</p>
    </div>`;
    bindHeader();
    app.querySelectorAll("[data-choice]").forEach((b) => {
      b.onclick = () => {
        const a = ex.answers[q.id] || (ex.answers[q.id] = {});
        if (q.type === "ui_spot" || q.type === "screen_spot") a.reason = b.dataset.choice; else a.choice = b.dataset.choice;
        renderExam();
      };
    });
    if (q.type === "ui_spot" || q.type === "screen_spot") {
      app.querySelectorAll("[data-el]").forEach((g) => {
        const pick = () => {
          const a = ex.answers[q.id] || (ex.answers[q.id] = {});
          a.node = g.dataset.el;
          renderExam();
        };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
      });
    }
    app.querySelectorAll("[data-nav]").forEach((b) => {
      b.onclick = () => { state.idx += b.dataset.nav === "next" ? 1 : -1; renderExam(); };
    });
    const fl = app.querySelectorAll("[data-flag]")[0];
    if (fl) fl.onclick = () => { ex.flags[q.id] = !ex.flags[q.id]; renderExam(); };
    const fin = app.querySelectorAll("[data-finish]")[0];
    if (fin) fin.onclick = () => finishExam();
  }
  function finishExam() {
    const ex = state.exam;
    if (!ex || ex.finished) return;
    ex.finished = true;
    stopTimer();
    const qs = state.session;
    let correct = 0;
    const perDomain = {};
    qs.forEach((q) => {
      const ok = gradeExamQuestion(q, ex.answers[q.id]);
      if (ok) correct++;
      recordAttempt(q, ok, ex.kind === "mock" ? "mock" : "cross");
      perDomain[q.domain] = perDomain[q.domain] || { ok: 0, n: 0 };
      perDomain[q.domain].n++; if (ok) perDomain[q.domain].ok++;
    });
    const ratio = qs.length ? correct / qs.length : 0;
    let passInfo = null;
    if (ex.cfg.pass && ex.cfg.pass.type === "ratio") {
      const need = Math.ceil(qs.length * ex.cfg.pass.value);
      passInfo = { need, reached: correct >= need, shortBy: Math.max(0, need - correct), note: ex.cfg.pass.note };
    }
    ex.result = { correct, total: qs.length, ratio, perDomain, passInfo, usedSec: examElapsedSec() };
    state.view = "quiz";
    renderExamResult();
  }
  function renderExamResult() {
    const ex = state.exam;
    if (!ex || !ex.result) { startSession(null); return; }
    const r = ex.result;
    const rows = Object.keys(r.perDomain).map((code) =>
      `<div class="drow"><div class="dmain"><span class="dname">${esc(domainName(code))}</span><span>${r.perDomain[code].ok} / ${r.perDomain[code].n}問正解</span></div></div>`).join("");
    const passHtml = r.passInfo
      ? (r.passInfo.reached
          ? `<p class="big">サイト内目安（正答率${Math.round((ex.cfg.pass ? ex.cfg.pass.value : 0.7) * 100)}%）に到達しました！</p>`
          : `<p class="big">目安まであと${r.passInfo.shortBy}問正解で到達です。</p>`)
        + `<p class="src">${esc(r.passInfo.note)}</p>`
      : `<p class="src">このモードでは合格目安は表示しません。</p>`;
    const fullNote = ex.limitSec && ex.cfg.count && r.total < ex.cfg.count
      ? `（短縮版のため本番の${ex.cfg.count}問・${Math.round(ex.limitSec / 60)}分とは異なります）` : "";
    app.innerHTML = header() + `<div class="card"><h2>結果（${esc(ex.cfg.label)}）</h2>
      <p class="big">${r.total}問中 ${r.correct}問正解（正答率 ${Math.round(r.ratio * 100)}%）</p>
      <p class="src">所要時間 ${fmtClock(r.usedSec)}${ex.limitSec ? " / 制限 " + fmtClock(ex.limitSec) : ""}${fullNote}</p>
      ${passHtml}
      ${rows}
      <div class="mapbtns">
        <button id="againExam">もう一度</button>
        <button data-view="map" class="ghost">分野マップを見る</button>
        <button id="toPractice" class="ghost">練習にもどる</button>
      </div></div>`;
    bindHeader();
    const ag = document.getElementById("againExam");
    if (ag) ag.onclick = () => startExam(ex.kind);
    const tp = document.getElementById("toPractice");
    if (tp) tp.onclick = () => startSession(null);
  }

  /* ---------- JSON export (checksum: SHA-256 when available, else FNV-1a) ---------- */
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  function exportRecords() {
    const rec = loadRecords();
    const payload = { app: "kt", version: 1, productId: state.product, exportedAt: new Date().toISOString(), records: rec };
    const bodyStr = JSON.stringify(rec);
    const finish = (algo, value) => {
      payload.checksum = { algo, value };
      const text = JSON.stringify(payload, null, 2);
      window.KT_LAST_EXPORT = text;
      const box = document.getElementById("exportBox");
      if (box) box.innerHTML = `<p class="src">エクスポートを作成しました（チェックサム: ${esc(algo)}）。下のJSONをコピーして保存してください。</p><textarea class="export" readonly>${esc(text)}</textarea>`;
      try {
        if (typeof Blob !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
          a.download = "kt-" + state.product + "-records.json";
          document.body.appendChild(a); a.click(); a.remove();
        }
      } catch (e) { /* textarea copy remains available */ }
    };
    try {
      if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
        crypto.subtle.digest("SHA-256", new TextEncoder().encode(bodyStr)).then((buf) => {
          const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
          finish("sha256", hex);
        }).catch(() => finish("fnv1a", fnv1a(bodyStr)));
      } else finish("fnv1a", fnv1a(bodyStr));
    } catch (e) { finish("fnv1a", fnv1a(bodyStr)); }
  }

  function updateAnswerBtn(q) {
    const ok = q.type === "ui_spot" || q.type === "screen_spot" ? (state.picked && state.pickedReason) : state.picked;
    document.getElementById("answerBtn").disabled = !ok;
  }

  function flowSvg(flow) {
    const cellW = 180, cellH = 96, m = 24;
    const pos = {};
    flow.nodes.forEach((n) => { pos[n.id] = { x: m + n.col * cellW + cellW / 2, y: m + n.row * cellH + cellH / 2, n }; });
    const maxCol = Math.max(...flow.nodes.map((n) => n.col)), maxRow = Math.max(...flow.nodes.map((n) => n.row));
    const W = m * 2 + (maxCol + 1) * cellW, H = m * 2 + (maxRow + 1) * cellH;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="flow" role="group" aria-label="フロー図（学習用モック）">`;
    s += `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748B"/></marker></defs>`;
    (flow.groups || []).forEach((g) => {
      const pts = g.members.map((id) => pos[id]);
      const x1 = Math.min(...pts.map((p) => p.x)) - 78, x2 = Math.max(...pts.map((p) => p.x)) + 78;
      const y1 = Math.min(...pts.map((p) => p.y)) - 44, y2 = Math.max(...pts.map((p) => p.y)) + 44;
      s += `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" rx="12" class="group"/><text x="${x1 + 8}" y="${y1 + 16}" class="glabel">${esc(g.label)}</text>`;
    });
    flow.edges.forEach((e) => {
      const a = pos[e.from], b = pos[e.to];
      let d;
      if (e.via) {
        const pts = [[a.x, a.y]].concat(e.via.map((v) => [m + v[0] * cellW + cellW / 2, m + v[1] * cellH + cellH / 2])).concat([[b.x, b.y]]);
        d = "M" + pts.map((p) => p[0] + "," + p[1]).join(" L");
      } else if (a.x === b.x) {
        d = `M${a.x},${a.y + 26} L${b.x},${b.y - 26}`;
      } else {
        const midY = a.y + cellH / 2;
        d = `M${a.x},${a.y + 26} L${a.x},${midY} L${b.x},${midY} L${b.x},${b.y - 26}`;
      }
      s += `<path d="${d}" class="edge" marker-end="url(#arr)"/>`;
      if (e.label) s += `<text x="${(a.x + b.x) / 2 + 6}" y="${(a.y + b.y) / 2}" class="elabel">${esc(e.label)}</text>`;
    });
    flow.nodes.forEach((n) => {
      const p = pos[n.id];
      const shape = n.kind === "decision"
        ? `<polygon points="${p.x},${p.y - 26} ${p.x + 62},${p.y} ${p.x},${p.y + 26} ${p.x - 62},${p.y}" class="node"/>`
        : n.kind === "start" || n.kind === "end"
          ? `<rect x="${p.x - 52}" y="${p.y - 20}" width="104" height="40" rx="20" class="node"/>`
          : `<rect x="${p.x - 70}" y="${p.y - 24}" width="140" height="48" rx="8" class="node"/>`;
      s += `<g data-el="${esc(n.id)}" tabindex="0" role="button" aria-label="ノード: ${esc(n.label)}">${shape}
        <rect x="${p.x - 70}" y="${p.y - 24}" width="140" height="48" fill="transparent"/>
        <text x="${p.x}" y="${p.y + 4}" class="nlabel">${esc(n.label)}</text></g>`;
    });
    s += `</svg><p class="mocknote">実際の画面とは配置・デザインが異なります（学習用モック）</p>`;
    return s;
  }

  function bindFlow(q) {
    app.querySelectorAll("[data-el]").forEach((g) => {
      const pick = () => {
        if (state.locked) return;
        state.picked = g.dataset.el;
        app.querySelectorAll("[data-el]").forEach((x) => x.classList.toggle("picked", x === g));
        const node = q.ui.flow.nodes.find((n) => n.id === state.picked);
        document.getElementById("selLabel").textContent = "選択中：" + (node ? node.label : state.picked);
        updateAnswerBtn(q);
      };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    });
  }

  function screenHtml(q, selectedId) {
    const sc = q.screen || {};
    const rows = (sc.rows || []).map((r) =>
      `<div class="mw-row ${selectedId === r.id ? "sel" : ""}" data-el="${esc(r.id)}" tabindex="0" role="button">
        <span class="mw-label">${esc(r.label)}</span><span class="mw-value">${esc(r.value)}</span></div>`).join("");
    return `<div class="mockwin" role="group" aria-label="設定画面（学習用モック）">
      <div class="mw-head"><span class="mw-dots">● ● ●</span> ${esc(sc.title || "設定画面")}</div>
      ${sc.subtitle ? `<div class="mw-sub">${esc(sc.subtitle)}</div>` : ""}
      <div class="mw-rows">${rows}
        <div class="mw-row mw-none ${selectedId === "__none__" ? "sel" : ""}" data-el="__none__" tabindex="0" role="button">
          <span class="mw-label">誤っている箇所はない</span><span class="mw-value">この設定で正しい</span></div>
      </div>
      <div class="mw-foot">※ 自作のモック画面です。実際の製品とはデザイン・レイアウトが異なります。</div>
    </div>`;
  }

  function bindScreen(q) {
    app.querySelectorAll("[data-el]").forEach((g) => {
      const pick = () => {
        if (state.locked) return;
        state.picked = g.dataset.el;
        app.querySelectorAll("[data-el]").forEach((x) => x.classList.toggle("picked", x === g));
        const row = (q.screen.rows || []).find((r) => r.id === state.picked);
        const label = state.picked === "__none__" ? "誤っている箇所はない" : (row ? row.label + "：" + row.value : state.picked);
        document.getElementById("selLabel").textContent = "選択中：" + label;
        updateAnswerBtn(q);
      };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    });
  }

  function grade(q) {
    state.locked = true; state.answered++;
    let correct = false, partial = "";
    if (q.type === "ui_spot" || q.type === "screen_spot") {
      let locOk;
      if (q.type === "screen_spot" && q.answer.length === 0) locOk = state.picked === "__none__";
      else locOk = q.answer.includes(state.picked) || ((q.ui && q.ui.accept) || []).includes(state.picked);
      const reasonOk = state.pickedReason === q.choices.find((c) => c.why && c.why.indexOf("正解") === 0)?.id || state.pickedReason === "r1";
      correct = locOk && reasonOk;
      if (locOk && !reasonOk) partial = "場所は合っています。理由を確認しましょう。";
    } else {
      correct = q.answer.includes(state.picked);
    }
    if (correct) state.score++;
    recordAttempt(q, correct);
    const fb = document.getElementById("feedback");
    const src = q.source && q.source[0] && q.source[0].url
      ? `<p class="src">出典: <a href="${esc(q.source[0].url)}" target="_blank" rel="noopener">${esc(q.source[0].title)}</a></p>` : "";
    const qs = state.session.length ? state.session : allQuestions();
    fb.innerHTML = `<div class="fb ${correct ? "ok" : "ng"}">
      <strong>${correct ? "ナイス！その理解でOK！" : "ここが今回の学びポイント！"}</strong>
      ${partial ? `<p>${esc(partial)}</p>` : ""}
      <p>${esc(q.explanation)}</p>${src}
      <button id="nextBtn">${state.idx + 1 >= qs.length ? "結果を見る" : "次へ"}</button></div>`;
    document.getElementById("answerBtn").disabled = true;
    document.getElementById("nextBtn").onclick = () => { state.idx++; render(); };
  }

  function bindHeader() {
    app.querySelectorAll("[data-prod]").forEach((b) => {
      b.onclick = () => { state.product = b.dataset.prod; startSession(null); };
    });
    app.querySelectorAll("[data-view]").forEach((b) => {
      b.onclick = () => { if (b.dataset.view === "map") { state.view = "map"; renderMap(); } };
    });
  }

  startSession(null);
})();

