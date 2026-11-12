"use strict";
/* Knowledge test engine v0.2: practice mode (immediate feedback) + ui_spot flow canvas
   + attempt records (localStorage) + domain mastery map + JSON export.
   Data: window.KT_DATA = { blueprism: {config, bank}, asteria: {config, bank} }
   Judgement: config.judgement (weighted recent-window accuracy, decay, min evidence). */
(function () {
  const app = document.getElementById("app");
  const state = { product: "blueprism", view: "quiz", mode: "practice", filter: null, session: [], idx: 0, score: 0, answered: 0, picked: null, pickedReason: null, locked: false, exam: null, timerId: null, resumed: false };
  const API_QUESTION_TOOLS = ["powerautomate", "copilot", "poweregg"];
  const questionFetchAttempted = new Set();

  async function loadToolQuestions() {
    const product = state.product;
    if (!API_QUESTION_TOOLS.includes(product) || questionFetchAttempted.has(product)) return;
    const tool = window.KT_DATA[product];
    questionFetchAttempted.add(product);
    try {
      const response = await fetch(`https://sq-questions-api.sola-labo.workers.dev/v1/tools/${product}/questions`);
      if (response.status !== 200) return;
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.questions) || !payload.questions.length) return;
      tool.bank.questions = payload.questions;
      // A response arriving after a tab switch must not replace that tool's screen.
      if (state.product === product) render();
    } catch (e) { /* Keep the static bank when the API is unavailable. */ }
  }

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
  function recordAttempt(q, correct, mode, countDaily = true) {
    const rec = loadRecords();
    const list = rec.attempts[q.id] || (rec.attempts[q.id] = []);
    list.push({ t: Date.now(), ok: !!correct, mode: mode || "practice" });
    if (list.length > 60) list.splice(0, list.length - 60);
    saveRecords(rec);
    if (countDaily) countDailyAnswer();
  }

  /* ---------- practice-session resume (saved inside the product record) ---------- */
  function saveResumeAt(pos) {
    if (state.mode !== "practice" || !state.session.length) return;
    const rec = loadRecords();
    rec.resume = { filter: state.filter, ids: state.session.map((q) => q.id), idx: pos, score: state.score, answered: state.answered, savedAt: Date.now() };
    saveRecords(rec);
  }
  function clearResume() {
    const rec = loadRecords();
    if (rec.resume) { delete rec.resume; saveRecords(rec); }
  }
  function tryResume(filter) {
    const rec = loadRecords();
    const r = rec.resume;
    if (!r || (r.filter || null) !== (filter || null) || !Array.isArray(r.ids)) return false;
    if (!(r.idx >= 0 && r.idx < r.ids.length)) return false;
    const byId = {};
    allQuestions().forEach((q) => { byId[q.id] = q; });
    if (!r.ids.every((id) => byId[id])) return false;
    state.session = r.ids.map((id) => byId[id]);
    state.idx = r.idx; state.score = r.score || 0; state.answered = r.answered || 0;
    state.resumed = true;
    return true;
  }

  /* ---------- judgement (per domain) ---------- */
  function domainStats(code) {
    return questionStats(allQuestions().filter((q) => q.domain === code));
  }
  function questionStats(qs) {
    const cfg = data().config.judgement;
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

  /* ---------- overall achievement (for the header strip / completion screen) ---------- */
  function overallStats() {
    const qs = allQuestions();
    const rec = loadRecords();
    let attempted = 0, attempts = 0, ok = 0;
    qs.forEach((q) => {
      const l = rec.attempts[q.id] || [];
      if (l.length) attempted++;
      attempts += l.length;
      l.forEach((a) => { if (a.ok) ok++; });
    });
    const labels = data().config.judgement.labels;
    const masterDomains = data().config.domains.filter((d) => domainStats(d.code).stage === labels[3]).map((d) => d.name);
    return { total: qs.length, attempted, attempts, ok, domains: data().config.domains.length, masters: masterDomains.length, masterDomains, pct: qs.length ? Math.round(attempted / qs.length * 100) : 0 };
  }

  /* Daily totals are independent of capped attempt histories and shared across tools.
     No historical timestamps are inferred or migrated. Completed days are immutable. */
  const dailyKey = "kt:daily:v1";
  const goals = [3, 5, 10, 20];
  function localDay(date = new Date()) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function loadDaily() {
    let d;
    try { d = JSON.parse(localStorage.getItem(dailyKey) || memFallback[dailyKey] || "null"); } catch (e) { d = JSON.parse(memFallback[dailyKey] || "null"); }
    if (!d || typeof d !== "object") d = {};
    return { v: 1, goal: goals.includes(d.goal) ? d.goal : 5,
      days: d.days && typeof d.days === "object" && !Array.isArray(d.days) ? d.days : {} };
  }
  function saveDaily(d) {
    memFallback[dailyKey] = JSON.stringify(d);
    try { localStorage.setItem(dailyKey, memFallback[dailyKey]); } catch (e) { /* memory only */ }
  }
  function dailyEntry(d) {
    const key = localDay();
    const old = d.days[key];
    if (!old || !Number.isSafeInteger(old.count) || old.count < 0) d.days[key] = { count: 0, achieved: false };
    return d.days[key];
  }
  function completeDaily(d, entry) {
    if (entry.count < d.goal || entry.achieved) return;
    entry.achieved = true;
    const toast = document.getElementById("dailyToast");
    toast.textContent = "今日の目標達成！よくがんばりました！";
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  function countDailyAnswer() {
    const d = loadDaily(), entry = dailyEntry(d);
    entry.count++;
    completeDaily(d, entry);
    saveDaily(d);
  }
  function dailyStreak(d) {
    const date = new Date();
    let n = 0;
    if (!d.days[localDay(date)]?.achieved) date.setDate(date.getDate() - 1);
    while (d.days[localDay(date)]?.achieved) { n++; date.setDate(date.getDate() - 1); }
    return n;
  }
  function showHome() {
    stopTimer();
    state.view = "home";
    renderHome();
  }
  function renderHome() {
    const cfg = data().config, labels = cfg.judgement.labels;
    const summary = [0, 0, 0, 0];
    cfg.objectives.forEach((o) => {
      const stats = questionStats(allQuestions().filter((q) => q.objective === o.id || (q.alsoCovers || []).includes(o.id)));
      summary[labels.indexOf(stats.stage)]++;
    });
    const items = cfg.domains.map((d) => ({ ...d, stats: domainStats(d.code) }));
    const weak = items.filter((d) => labels.indexOf(d.stats.stage) < 2).sort((a, b) =>
      labels.indexOf(a.stats.stage) - labels.indexOf(b.stats.stage) ||
      (a.stats.weighted ?? 0) - (b.stats.weighted ?? 0) || a.stats.attempts - b.stats.attempts);
    const d = loadDaily(), entry = dailyEntry(d);
    const notes = (window.releaseNotes || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const releaseHtml = notes.length ? `<section class="card" aria-labelledby="releaseTitle"><h2 id="releaseTitle">リリース情報</h2>${notes.map((n) => `<p><time datetime="${esc(n.date)}">${esc(n.date)}</time> ${esc(n.text)}</p>`).join("")}</section>` : "";
    app.innerHTML = header() + `<aside class="card" aria-label="お知らせ"><strong>問題追加中！やればやるほど知識がつく！改善提案は江口まで！</strong></aside>${releaseHtml}<section class="card hero"><p class="eyebrow">学びを、毎日の一歩に。</p><h1>${esc(cfg.displayName)}</h1>
      <p>今日も少しずつ、できることを増やしましょう。</p><div class="mapbtns"><button id="continuePractice" class="primary">${loadRecords().resume ? "練習を続ける" : "練習を始める"}</button>${examButtonHtml()}</div></section>
      <section class="card" aria-labelledby="dailyTitle"><div class="dmain"><h2 id="dailyTitle">今日のチャレンジ</h2><span>連続達成 <strong>${dailyStreak(d)}日</strong></span></div>
      <p class="src">全ツール共通・練習と模試の回答をカウント</p>
      <label for="dailyGoal">今日の目標</label> <select id="dailyGoal">${goals.map((g) => `<option value="${g}" ${g === d.goal ? "selected" : ""}>${g}問</option>`).join("")}</select>
      <p class="big">${entry.count} / ${d.goal}問</p><progress max="${d.goal}" value="${Math.min(entry.count, d.goal)}" aria-label="今日の回答数">${entry.count} / ${d.goal}</progress>
      <p>${entry.count >= d.goal ? "今日の目標達成！すばらしい積み重ねです。" : `あと${d.goal - entry.count}問で今日の目標達成`}</p>
      ${entry.count >= d.goal ? '<button id="morePractice" class="ghost">もっと解く</button>' : ""}</section>
      <section class="card" aria-labelledby="guideTitle"><h2 id="guideTitle">スキルガイド</h2><p>学習目標ごとの習熟サマリー</p>
      <div class="summary">${[3, 2, 1, 0].map((i) => `<span class="summary-item"><span class="chip ${stageClass(labels[i])}">${esc(labels[i])}</span> <strong>${summary[i]}件</strong></span>`).join("")}</div>
      <h3>あなたはまだここが足りません</h3>
      ${!items.some((x) => x.stats.attempts) ? '<p>まずは1問解いてみましょう。解いた分野から弱点が見えてきます。</p>' : ""}
      ${weak.length ? weak.map((x) => `<div class="drow"><div class="dmain"><strong>${esc(x.name)}</strong><span class="chip ${stageClass(x.stats.stage)}">${esc(x.stats.stage)}</span></div>
        <p class="dsub">正答率（直近加重） ${x.stats.weighted == null ? "—%" : Math.round(x.stats.weighted * 100) + "%"} ｜ 回答数 ${x.stats.attempts}回 / 総問題数 ${x.stats.total}問</p>
        <button class="ghost" data-domain="${esc(x.code)}">練習する<span class="sr-only">：${esc(x.name)}</span></button></div>`).join("") : '<p>弱点はありません。全分野が安定以上です。</p>'}</section>`;
    bindHeader();
    document.getElementById("continuePractice").onclick = () => startSession(loadRecords().resume?.filter || null);
    const more = document.getElementById("morePractice");
    if (more) more.onclick = () => startSession(null);
    app.querySelectorAll("[data-domain]").forEach((b) => { b.onclick = () => startSession(b.dataset.domain); });
    app.querySelectorAll("[data-exam]").forEach((b) => { b.onclick = () => startExam(b.dataset.exam); });
    document.getElementById("dailyGoal").onchange = (ev) => {
      const daily = loadDaily(); daily.goal = Number(ev.target.value);
      completeDaily(daily, dailyEntry(daily)); saveDaily(daily); renderHome();
    };
  }

  /* ---------- sessions ---------- */
  function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }

  function startSession(filter, forceFresh) {
    if (!allQuestions().length) return;
    stopTimer();
    state.mode = "practice"; state.exam = null;
    state.filter = filter || null;
    state.resumed = false;
    // Resume the saved practice session for this context when one exists
    // (eguchi's request, 2026-11-05: continue where you left off).
    if (!forceFresh && tryResume(state.filter)) { state.view = "quiz"; render(); return; }
    // Fresh sessions are shuffled on every start (product tab, domain pick, restart).
    state.session = shuffle(filter ? allQuestions().filter((q) => q.domain === filter) : allQuestions());
    state.idx = 0; state.score = 0; state.answered = 0; state.view = "quiz";
    saveResumeAt(0);
    render();
  }

  function header() {
    const c = data().config;
    document.documentElement.style.setProperty("--bp", c.theme.primary);
    const tabs = Object.keys(window.KT_DATA).map((pid) =>
      `<button data-prod="${pid}" class="${state.product === pid ? "on" : ""}">${esc(window.KT_DATA[pid].config.displayName)}</button>`).join("");
    const a = overallStats();
    return `<div class="bar">
      <nav class="tabs" aria-label="学習ツールの切替">${tabs}<a href="https://netamade.github.io/regex-dojo/" target="_blank" rel="noopener noreferrer">正規表現道場 ↗</a></nav>
      <div class="bar2">
        <button data-view="home" class="ghost">ホーム</button>
        <button data-view="map" class="ghost">分野マップ</button>
        <span class="score">正解 ${state.score} / 回答 ${state.answered}</span>
      </div>
    </div>
    <div class="achv"><div class="achvbar"><div class="achvfill" style="width:${a.pct}%"></div></div><span class="achvtxt">達成度 ${a.pct}%（解いた問題 ${a.attempted}/${a.total}問 ・ マスター分野 ${a.masters}/${a.domains}）</span></div>
    <p class="disc">${esc(c.disclaimer)}（試作版）</p>
    ${allQuestions().length ? "" : '<p class="card" role="status">問題は順次追加中です</p>'}`;
  }

  function render() {
    if (state.view === "home") { renderHome(); return; }
    if (state.view === "map") { renderMap(); return; }
    if (state.mode === "exam") { renderExam(); return; }
    const qs = state.session.length ? state.session : allQuestions();
    if (state.idx >= qs.length) {
      clearResume();
      const a = overallStats();
      const acc = qs.length ? state.score / qs.length : 0;
      const msg = acc >= 0.9 ? "すごい！ほぼ完璧な仕上がりです。" : acc >= 0.7 ? "いい調子！その調子で続けましょう。" : acc >= 0.5 ? "着実に前進しています。" : "間違えた問題こそ伸びしろです。解説をチェックしましょう。";
      app.innerHTML = header() + `<div class="card"><h2>チャレンジ完了！</h2>
        <p class="big">${esc(msg)}</p>
        <p>${qs.length}問中 ${state.score}問正解でした。</p>
        <p>通算の達成度は <strong>${a.pct}%</strong>（解いた問題 ${a.attempted}/${a.total}問）です。${a.masterDomains.length ? `マスター分野：${esc(a.masterDomains.join("、"))}。` : ""}</p>
        <p class="src">到達度は分野マップに記録されています。</p>
        <button id="restart">最初から</button>
        <button data-view="map" class="ghost">分野マップを見る</button></div>`;
      bindHeader();
      document.getElementById("restart").onclick = () => startSession(null, true);
      return;
    }
    const q = qs[state.idx];
    state.picked = null; state.pickedReason = null; state.locked = false;
    let body = "";
    if (q.type === "ui_spot") body = flowSvg(q.ui.flow) + `<p class="sel" id="selLabel">${q.ui.flow.edgePick ? "ノードまたは接続線をクリックして選んでください" : "ノードをクリックして選んでください"}</p>`;
    if (q.type === "screen_spot") body = screenHtml(q, null) + `<p class="sel" id="selLabel">誤っていると思う行をクリックして選んでください</p>`;
    const shown = q.shuffle ? shuffle(q.choices) : q.choices;
    const choices = shown.map((c) =>
      `<button class="choice" data-choice="${esc(c.id)}">${esc(c.text)}</button>`).join("");
    app.innerHTML = header() + `<div class="card">
      ${state.resumed ? `<div class="resume">前回のつづきから再開しました（${state.idx + 1}問目／全${qs.length}問） <button id="resumeReset" class="ghost">最初からやり直す</button></div>` : ""}
      <div class="meta">${esc(domainName(q.domain))} ｜ ${state.idx + 1} / ${qs.length}問 ｜ ${q.type === "ui_spot" || q.type === "screen_spot" ? "画面再現問題（誤り探し）" : "四択"}</div>
      <div class="sprog"><div style="width:${qs.length ? Math.round(state.answered / qs.length * 100) : 0}%"></div></div>
      <h2 class="stem">${esc(q.stem)}</h2>
      ${body}
      <div class="choices">${choices}</div>
      <button id="answerBtn" disabled>回答する</button>
      <div id="feedback"></div>
    </div>`;
    bindHeader();
    const rr = document.getElementById("resumeReset");
    if (rr) rr.onclick = () => startSession(state.filter, true);
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

  /* ---------- skill radar + proficiency evaluation ---------- */
  function domainScore(s) {
    if (!s.attempts || s.weighted == null) return 0;
    return Math.round(s.weighted * 100 * s.coverage);
  }
  function skillSummary() {
    const cfg = data().config;
    const items = cfg.domains.map((d) => {
      const s = domainStats(d.code);
      return { code: d.code, name: d.name, stats: s, score: domainScore(s) };
    });
    const anyAttempts = items.some((x) => x.stats.attempts > 0);
    const avg = items.length ? Math.round(items.reduce((a, x) => a + x.score, 0) / items.length) : 0;
    const rank = !anyAttempts ? "—" : avg >= 80 ? "S" : avg >= 65 ? "A" : avg >= 50 ? "B" : avg >= 35 ? "C" : avg >= 20 ? "D" : "E";
    const rankMsg = {
      "S": "全分野で高い水準です。模擬試験で仕上げにいきましょう。",
      "A": "かなり仕上がっています。残りの分野を埋めれば盤石です。",
      "B": "基礎は固まってきました。弱点分野を集中して練習しましょう。",
      "C": "伸びている途中です。未着手の分野にも広げていきましょう。",
      "D": "まずは1分野を集中して解いて、成功体験を積みましょう。",
      "E": "これからスタートです。気になる分野から少しずつ始めましょう。",
    };
    const comments = [];
    if (!anyAttempts) {
      comments.push("まだ記録がありません。まずは1分野を練習してみましょう。");
    } else {
      comments.push(rankMsg[rank]);
      const attempted = items.filter((x) => x.stats.attempts > 0);
      const best = attempted.reduce((a, x) => (x.score > a.score ? x : a), attempted[0]);
      if (best && best.score >= 60) comments.push(`得意分野は「${best.name}」（${best.score}点）。この調子で伸ばしましょう。`);
      const weak = attempted.reduce((a, x) => (x.score < a.score ? x : a), attempted[0]);
      if (weak && weak !== best && weak.score < 50) comments.push(`「${weak.name}」が伸びしろです（${weak.score}点）。分野別練習での集中特訓がおすすめです。`);
      const untouched = items.filter((x) => x.stats.attempts === 0).length;
      if (untouched) comments.push(`未着手の分野が${untouched}つあります。新しい分野にも挑戦してみましょう。`);
    }
    return { items, avg, rank, comments, anyAttempts };
  }
  function radarSvg(items) {
    const cx = 190, cy = 160, R = 104;
    const n = items.length;
    const pt = (i, v) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const r = (R * v) / 100;
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang), ang];
    };
    let s = `<svg viewBox="0 0 380 320" class="radar" role="img" aria-label="スキルレーダーチャート">`;
    [25, 50, 75, 100].forEach((v) => {
      const ring = items.map((_, i) => pt(i, v).slice(0, 2).join(",")).join(" ");
      s += `<polygon points="${ring}" class="ring"/>`;
    });
    items.forEach((it, i) => {
      const [x, y] = pt(i, 100);
      s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="axis"/>`;
    });
    const val = items.map((it, i) => pt(i, it.score).slice(0, 2).join(",")).join(" ");
    s += `<polygon points="${val}" class="val"/>`;
    items.forEach((it, i) => {
      const [x, y] = pt(i, it.score);
      s += `<circle cx="${x}" cy="${y}" r="3.5" class="vdot"/>`;
    });
    items.forEach((it, i) => {
      const [x, y, ang] = pt(i, 122);
      const cos = Math.cos(ang);
      const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
      const seg = it.name.split("・")[0];
      const label = seg.length <= 10 ? seg : seg.slice(0, 10);
      s += `<text x="${x}" y="${y + 3}" text-anchor="${anchor}" class="rlabel">${esc(label)} ${it.score}</text>`;
    });
    s += `</svg>`;
    return s;
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
        <div class="dbar"><div style="width:${Math.round(s.coverage * 100)}%"></div></div>
        <div class="dsub">挑戦済み ${s.attempted}/${s.total}問 ｜ 習熟度 ${domainScore(s)}点 ｜ 正答率（直近加重） ${pct} ｜ 回答 ${s.attempts} ｜ ${esc(hint)}</div>
        <button data-domain="${esc(d.code)}" class="ghost">この分野を練習</button>
      </div>`;
    }).join("");
    const sk = skillSummary();
    const skillHtml = `<div class="skillbox">
      <h3>スキルレーダー（${esc(cfg.displayName)}）</h3>
      <div class="skillflex">
        ${radarSvg(sk.items)}
        <div class="skillpanel">
          <p class="skillrank">総合習熟度 <span class="rankbadge rk${sk.rank}">${esc(sk.rank)}</span> ランク（${sk.avg}点）</p>
          <p class="src">分野スコア（0〜100点）＝ 正答率（直近加重）× 挑戦済み割合。総合習熟度は全分野の平均です。</p>
          <ul class="skillcomments">${sk.comments.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        </div>
      </div>
    </div>`;
    app.innerHTML = header() + `<div class="card"><h2>分野マップ（${esc(cfg.displayName)}）</h2>
      <p class="src">到達度は直近${cfg.judgement.window}回答の加重正答率で判定します（${cfg.judgement.minEvidence}回答から判定）。記録はこのブラウザに保存されます。</p>
      ${skillHtml}
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
    if (!allQuestions().length) return;
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
    state.exam = { kind, cfg: spec.cfg, startTs: Date.now(), limitSec, answers: {}, flags: {}, dailyCounted: {}, finished: false, result: null };
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
    if (q.type === "ui_spot") {
      const selEdge = ans.node ? (q.ui.flow.edges || []).find((e) => e.id === ans.node) : null;
      const selNode = ans.node ? q.ui.flow.nodes.find((n) => n.id === ans.node) : null;
      let selText = q.ui.flow.edgePick ? "ノードまたは接続線をクリックして選んでください" : "ノードをクリックして選んでください";
      if (selNode) selText = "選択中：" + selNode.label;
      else if (selEdge) {
        const fl = (q.ui.flow.nodes.find((n) => n.id === selEdge.from) || {}).label || selEdge.from;
        const tl = (q.ui.flow.nodes.find((n) => n.id === selEdge.to) || {}).label || selEdge.to;
        selText = "選択中：接続：" + fl + " → " + tl;
      } else if (ans.node) selText = "選択中：" + ans.node;
      body = flowSvg(q.ui.flow, ans.node || null) + `<p class="sel" id="selLabel">${esc(selText)}</p>`;
    }
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
        countExamAnswer(q);
        renderExam();
      };
    });
    if (q.type === "ui_spot" || q.type === "screen_spot") {
      app.querySelectorAll("[data-el]").forEach((g) => {
        const pick = () => {
          const a = ex.answers[q.id] || (ex.answers[q.id] = {});
          a.node = g.dataset.el;
          countExamAnswer(q);
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
  function countExamAnswer(q) {
    const ex = state.exam, a = ex.answers[q.id];
    const complete = q.type === "ui_spot" || q.type === "screen_spot" ? a?.node && a?.reason : a?.choice;
    if (complete && !ex.dailyCounted[q.id]) {
      ex.dailyCounted[q.id] = true;
      countDailyAnswer();
    }
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
      recordAttempt(q, ok, ex.kind === "mock" ? "mock" : "cross", false);
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

  function flowSvg(flow, selectedId) {
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
      if (flow.edgePick) {
        const fromL = (flow.nodes.find((n) => n.id === e.from) || {}).label || e.from;
        const toL = (flow.nodes.find((n) => n.id === e.to) || {}).label || e.to;
        s += `<path d="${d}" class="edge${selectedId === e.id ? " picked" : ""}" data-visfor="${esc(e.id)}" marker-end="url(#arr)"/>`;
        s += `<path d="${d}" class="edgehit" data-el="${esc(e.id)}" tabindex="0" role="button" aria-label="接続: ${esc(fromL)} から ${esc(toL)}"/>`;
      } else {
        s += `<path d="${d}" class="edge" marker-end="url(#arr)"/>`;
      }
      if (e.label) s += `<text x="${(a.x + b.x) / 2 + 6}" y="${(a.y + b.y) / 2}" class="elabel">${esc(e.label)}</text>`;
    });
    flow.nodes.forEach((n) => {
      const p = pos[n.id];
      const shape = n.kind === "decision"
        ? `<polygon points="${p.x},${p.y - 26} ${p.x + 62},${p.y} ${p.x},${p.y + 26} ${p.x - 62},${p.y}" class="node"/>`
        : n.kind === "start" || n.kind === "end"
          ? `<rect x="${p.x - 52}" y="${p.y - 20}" width="104" height="40" rx="20" class="node"/>`
          : `<rect x="${p.x - 70}" y="${p.y - 24}" width="140" height="48" rx="8" class="node"/>`;
      s += `<g data-el="${esc(n.id)}" tabindex="0" role="button" aria-label="ノード: ${esc(n.label)}" class="${selectedId === n.id ? "picked" : ""}">${shape}
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
        app.querySelectorAll("[data-visfor]").forEach((x) => x.classList.toggle("picked", x.dataset.visfor === state.picked));
        const node = q.ui.flow.nodes.find((n) => n.id === state.picked);
        const edge = (q.ui.flow.edges || []).find((e) => e.id === state.picked);
        let label = state.picked;
        if (node) label = node.label;
        else if (edge) {
          const fl = (q.ui.flow.nodes.find((n) => n.id === edge.from) || {}).label || edge.from;
          const tl = (q.ui.flow.nodes.find((n) => n.id === edge.to) || {}).label || edge.to;
          label = "接続：" + fl + " → " + tl;
        }
        document.getElementById("selLabel").textContent = "選択中：" + label;
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
    state.resumed = false;
    // Save the resume point at the next question (or clear it when the session is done).
    if (state.session.length && state.idx + 1 >= state.session.length) clearResume();
    else saveResumeAt(state.idx + 1);
    const fb = document.getElementById("feedback");
    const src = q.source && q.source[0] && q.source[0].url
      ? `<p class="src">出典: <a href="${esc(q.source[0].url)}" target="_blank" rel="noopener">${esc(q.source[0].title)}</a></p>` : "";
    const qs = state.session.length ? state.session : allQuestions();
    fb.innerHTML = `<div class="fb ${correct ? "ok" : "ng"}">
      ${correct
        ? '<svg class="fb-mark fb-hanamaru" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 C72 4 92 22 94 46 C96 71 78 93 53 95 C28 97 7 79 6 54 C5 29 26 8 50 6 Z" fill="none" stroke="#e03a1e" stroke-width="5" stroke-linecap="round"/><path d="M50 18 C66 17 81 30 82 47 C83 65 69 82 52 83 C35 84 19 70 18 53 C17 35 33 19 50 18 Z" fill="none" stroke="#e03a1e" stroke-width="4" stroke-linecap="round"/><path d="M38 38 C44 30 58 29 64 37 M34 55 C31 45 36 33 45 29 M66 55 C69 65 63 76 54 79 M45 68 C53 73 65 70 69 61" fill="none" stroke="#e03a1e" stroke-width="4" stroke-linecap="round"/></svg>'
        : '<svg class="fb-mark fb-batsu" viewBox="0 0 100 100" aria-hidden="true"><path d="M22 22 L78 78 M78 22 L22 78" stroke="#34548f" stroke-width="11" stroke-linecap="round" fill="none"/></svg>'}
      <strong>${correct ? "ナイス！その理解でOK！" : "ここが今回の学びポイント！"}</strong>
      ${partial ? `<p>${esc(partial)}</p>` : ""}
      <p>${esc(q.explanation)}</p>${src}
      <button id="nextBtn">${state.idx + 1 >= qs.length ? "結果を見る" : "次へ"}</button></div>`;
    document.getElementById("answerBtn").disabled = true;
    document.getElementById("nextBtn").onclick = () => { state.idx++; render(); };
  }

  function bindHeader() {
    if (!allQuestions().length) {
      app.querySelectorAll("#continuePractice, #morePractice, #allPractice, [data-domain], [data-exam]").forEach((b) => { b.disabled = true; });
    }
    app.querySelectorAll("[data-prod]").forEach((b) => {
      b.onclick = () => { state.product = b.dataset.prod; showHome(); loadToolQuestions(); };
    });
    app.querySelectorAll("[data-view]").forEach((b) => {
      b.onclick = () => { if (b.dataset.view === "home") showHome(); else if (b.dataset.view === "map") { state.view = "map"; renderMap(); } };
    });
  }

  showHome();
  // Refresh local-day progress after returning to a tab or crossing midnight.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.view === "home") renderHome(); });
  setInterval(() => { if (state.view === "home") renderHome(); }, 60000);
})();

