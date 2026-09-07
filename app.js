(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAX_MM = 150;
  const SCALE_END_MM = 200; // Extra graduations support the 49 mm vernier at full opening.
  const PX_PER_MM = 9;
  const SCALE_X = 230;
  const FULL_WIDTH = 2180;

  const state = {
    leastCount: 0.05,
    step: 382,
    mode: "explore",
    answerVisible: true,
    showAlignment: false,
    readingStep: 0,
    focusPart: null,
    viewZoom: 1.85,
    workpieceMode: "none",
    workpieceStep: null,
    dragging: null,
  };

  const modeDescription = {
    explore: "拖動活動量爪或下方滑桿，主尺與游標尺會同步移動。刻線保持在同一平面，可直接比較。",
    tutorial: "依照下方四個步驟閱讀；卡尺會直接標記目前該看的刻線，不需要切換畫面。",
    quiz: "量爪位置已鎖定。先直接從卡尺上讀數，準備好後再按一下顯示答案。",
  };

  const caliperSvg = $("#caliperSvg");

  function spm() { return Math.round(1 / state.leastCount); }
  function valueMm() { return state.step / spm(); }
  function mainMm() { return Math.floor(state.step / spm()); }
  function vernierIndex() { return state.step % spm(); }
  function vernierValue() { return vernierIndex() * state.leastCount; }
  function decimals() { return state.leastCount === 0.1 ? 1 : 2; }
  function fmt(number) { return Number(number).toFixed(decimals()); }
  function isAnswerHidden() { return state.mode === "quiz" && !state.answerVisible; }
  function canShowAlignment() { return state.showAlignment && !isAnswerHidden(); }
  function hasWorkpiece() { return state.workpieceMode !== "none" && state.workpieceStep !== null; }
  function isContact() { return hasWorkpiece() && state.step === state.workpieceStep; }
  function workpieceMm() { return hasWorkpiece() ? state.workpieceStep / spm() : 0; }

  function safeText(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function svgEl(name, attrs = {}, text = "") {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== "") el.textContent = text;
    return el;
  }

  function makeMainScale(group) {
    group.append(svgEl("line", { x1: SCALE_X, y1: 225, x2: SCALE_X + SCALE_END_MM * PX_PER_MM, y2: 225, stroke: "#52637a", "stroke-width": 2 }));
    for (let mm = 0; mm <= SCALE_END_MM; mm++) {
      const x = SCALE_X + mm * PX_PER_MM;
      const major = mm % 10 === 0;
      const mid = mm % 5 === 0;
      const tick = svgEl("line", {
        x1: x, y1: 225, x2: x, y2: major ? 148 : mid ? 164 : 181,
        stroke: major ? "#37475c" : "#6d7c90",
        "stroke-width": major ? 2.7 : mid ? 2 : 1.5,
        "vector-effect": "non-scaling-stroke",
      });
      group.append(tick);
      if (major) {
        group.append(svgEl("text", { x, y: 132, fill: "#314055", "font-size": 21, "text-anchor": "middle", "font-family": "Cascadia Mono, monospace", "font-weight": 650 }, mm));
      }
    }
    group.append(svgEl("text", { x: SCALE_X + SCALE_END_MM * PX_PER_MM + 35, y: 132, fill: "#66758a", "font-size": 17 }, "mm"));
  }

  function makeVernier(group) {
    const count = spm();
    const tickSpacing = (1 - state.leastCount) * PX_PER_MM;
    const vernierWidth = count * tickSpacing;
    const bodyWidth = vernierWidth + 66;
    const showAlign = canShowAlignment();
    const aligned = vernierIndex();

    group.append(svgEl("path", {
      d: `M 0 219 H ${bodyWidth} V 375 H 115 L 88 512 H 0 Z`,
      fill: "#c8d5e5", stroke: "#8fa0b6", "stroke-width": 3,
      class: state.focusPart === "moving" ? "part-focus" : "",
    }));
    group.append(svgEl("path", {
      d: "M -38 78 H 0 V 17 H -18 L -40 44 Z",
      fill: "#c8d5e5", stroke: "#8fa0b6", "stroke-width": 3,
      class: state.focusPart === "moving" ? "part-focus" : "",
    }));
    group.append(svgEl("rect", { x: 0, y: 219, width: bodyWidth, height: 100, fill: "#f5f8fc", stroke: "#8fa0b6", "stroke-width": 3 }));
    group.append(svgEl("line", { x1: 0, y1: 219, x2: vernierWidth, y2: 219, stroke: "#52637a", "stroke-width": 2 }));

    for (let index = 0; index <= count; index++) {
      const x = index * tickSpacing;
      const labelEvery = count === 50 ? 5 : count === 20 ? 4 : 5;
      const major = index === 0 || index === count || index % labelEvery === 0;
      const isAligned = showAlign && index === aligned;
      group.append(svgEl("line", {
        x1: x, y1: 219, x2: x, y2: major ? 273 : 255,
        stroke: isAligned ? "#c64242" : "#3f5066",
        "stroke-width": isAligned ? 4 : major ? 2.3 : 1.4,
        "vector-effect": "non-scaling-stroke",
      }));
      if (major) {
        group.append(svgEl("text", {
          x, y: 300, fill: isAligned ? "#a52d2d" : "#334257", "font-size": count === 50 ? 14 : 18,
          "text-anchor": "middle", "font-family": "Cascadia Mono, monospace", "font-weight": isAligned ? 800 : 600,
        }, index));
      }
      if (isAligned) {
        group.append(svgEl("path", { d: `M ${x-8} 202 L ${x+8} 202 L ${x} 213 Z`, fill: "#c64242" }));
      }
    }

    group.append(svgEl("line", { x1: 0, y1: 210, x2: 0, y2: 318, stroke: "#176df5", "stroke-width": 4, "vector-effect": "non-scaling-stroke" }));
    group.append(svgEl("text", { x: 10, y: 340, fill: "#176df5", "font-size": 15, "font-family": "Cascadia Mono, monospace", "font-weight": 700 }, `游標 0 · ${state.leastCount} mm`));
    group.append(svgEl("rect", { x: -28, y: 195, width: Math.max(bodyWidth + 40, 150), height: 335, fill: "transparent", class: "slider-hit", "data-slider-hit": "true", tabindex: state.mode === "quiz" ? -1 : 0, role: state.mode === "quiz" ? "presentation" : "slider", "aria-label": "活動量爪位置", ...(state.mode === "quiz" ? {} : {"aria-valuemin": 0, "aria-valuemax": MAX_MM, "aria-valuenow": valueMm().toFixed(2)}) }));
    return bodyWidth;
  }

  function makeWorkpiece() {
    if (!hasWorkpiece()) return null;
    const group = svgEl("g", { class: `workpiece workpiece-${state.workpieceMode}` });
    const targetX = SCALE_X + workpieceMm() * PX_PER_MM;
    const targetWidth = Math.max(18, targetX - SCALE_X);
    const contact = isContact();
    const workFill = "#f4cf9e";
    const workStroke = contact ? "#16845a" : "#c57a35";

    if (state.workpieceMode === "outer") {
      group.append(svgEl("rect", { x: SCALE_X, y: 344, width: targetWidth, height: 158, rx: 0, fill: workFill, stroke: workStroke, "stroke-width": contact ? 3 : 2 }));
      for (let x = SCALE_X + 18; x < targetX - 8; x += 26) {
        group.append(svgEl("line", { x1: x, y1: 355, x2: x + 30, y2: 490, stroke: "#dca365", "stroke-width": 2, opacity: .58 }));
      }
      group.append(svgEl("rect", { x: SCALE_X + targetWidth/2 - 58, y: 392, width: 116, height: 36, rx: 18, fill: "#fff8ee", stroke: "#dca365" }));
      group.append(svgEl("text", { x: SCALE_X + targetWidth/2, y: 416, fill: "#8a5427", "font-size": 15, "text-anchor": "middle", "font-family": "Cascadia Mono, monospace", "font-weight": 700 }, "未知外部尺寸"));
    } else {
      const cx = SCALE_X + targetWidth / 2;
      group.append(svgEl("ellipse", { cx, cy: 63, rx: targetWidth/2 + 48, ry: 57, fill: workFill, stroke: workStroke, "stroke-width": contact ? 5 : 3 }));
      group.append(svgEl("ellipse", { cx, cy: 63, rx: targetWidth/2, ry: 33, fill: "#fff", stroke: "#c57a35", "stroke-width": 2 }));
      group.append(svgEl("text", { x: cx, y: 69, fill: "#8a5427", "font-size": 14, "text-anchor": "middle", "font-family": "Cascadia Mono, monospace", "font-weight": 700 }, "未知內徑"));
    }

    if (contact) {
      const contactY1 = state.workpieceMode === "outer" ? 337 : 16;
      const contactY2 = state.workpieceMode === "outer" ? 505 : 78;
      group.append(svgEl("line", { x1: targetX, y1: contactY1, x2: targetX, y2: contactY2, stroke: "#16845a", "stroke-width": 5, "stroke-linecap": "round" }));
    }
    return group;
  }

  function renderCaliper() {
    while (caliperSvg.lastChild && !["title", "desc"].includes(caliperSvg.lastChild.tagName?.toLowerCase())) caliperSvg.removeChild(caliperSvg.lastChild);

    const workpiece = makeWorkpiece();
    if (workpiece) caliperSvg.append(workpiece);

    const bg = svgEl("g");
    bg.append(svgEl("rect", { x: 90, y: 78, width: 1950, height: 165, rx: 2, fill: "#dce5f0", stroke: "#9eacbd", "stroke-width": 3 }));
    bg.append(svgEl("path", {
      d: "M 160 78 H 230 L 386 243 H 230 V 512 H 130 V 243 H 90 V 78 Z",
      fill: "#c8d5e5", stroke: "#8fa0b6", "stroke-width": 3,
      class: state.focusPart === "fixed" ? "part-focus" : "",
    }));
    bg.append(svgEl("rect", { x: 160, y: 78, width: 85, height: 165, fill: "none", stroke: "#8fa0b6", "stroke-width": 3 }));
    bg.append(svgEl("path", { d: "M 230 78 H 268 L 270 44 L 248 17 H 230 Z", fill: "#c8d5e5", stroke: "#8fa0b6", "stroke-width": 3 }));
    caliperSvg.append(bg);

    const mainGroup = svgEl("g", { class: state.focusPart === "main" ? "part-focus" : "" });
    makeMainScale(mainGroup);
    caliperSvg.append(mainGroup);

    const moving = svgEl("g", { class: `moving-assembly${state.focusPart === "vernier" ? " part-focus" : ""}`, transform: `translate(${SCALE_X + valueMm() * PX_PER_MM} 0)` });
    makeVernier(moving);
    caliperSvg.append(moving);

    // Measurement gap and labels.
    const gap = svgEl("g", { opacity: .9 });
    const jawX = SCALE_X + valueMm() * PX_PER_MM;
    gap.append(svgEl("line", { x1: SCALE_X, y1: 472, x2: jawX, y2: 472, stroke: "#176df5", "stroke-width": 2, "stroke-dasharray": "7 7" }));
    gap.append(svgEl("line", { x1: SCALE_X, y1: 458, x2: SCALE_X, y2: 487, stroke: "#176df5", "stroke-width": 2 }));
    gap.append(svgEl("line", { x1: jawX, y1: 458, x2: jawX, y2: 487, stroke: "#176df5", "stroke-width": 2 }));
    if (!isAnswerHidden() && (state.mode !== "tutorial" || state.readingStep >= 4)) {
      gap.append(svgEl("rect", { x: (SCALE_X + jawX)/2 - 49, y: 449, width: 98, height: 35, rx: 17, fill: "#fff", stroke: "#bad0f3" }));
      gap.append(svgEl("text", { x: (SCALE_X + jawX)/2, y: 473, fill: "#176df5", "font-size": 16, "text-anchor": "middle", "font-family": "Cascadia Mono, monospace", "font-weight": 700 }, `${fmt(valueMm())} mm`));
    }
    caliperSvg.append(gap);

    if (canShowAlignment()) {
      const index = vernierIndex();
      const alignedWorldX = SCALE_X + (mainMm() + index) * PX_PER_MM;
      caliperSvg.append(svgEl("line", { x1: alignedWorldX, y1: 138, x2: alignedWorldX, y2: 286, stroke: "#c64242", "stroke-width": 4, "vector-effect": "non-scaling-stroke", class: "alignment-guide" }));
      caliperSvg.append(svgEl("rect", { x: alignedWorldX - 72, y: 93, width: 144, height: 34, rx: 17, fill: "#fff2f2", stroke: "#c64242" }));
      caliperSvg.append(svgEl("text", { x: alignedWorldX, y: 116, fill: "#a52d2d", "font-size": 15, "text-anchor": "middle", "font-family": "Cascadia Mono, monospace", "font-weight": 750 }, `第 ${index} 線吻合`));
    }

    if (state.mode === "tutorial" && state.readingStep <= 2) {
      const x = SCALE_X + (state.readingStep === 1 ? valueMm() : mainMm()) * PX_PER_MM;
      caliperSvg.append(svgEl("line", {x1:x,y1:145,x2:x,y2:state.readingStep === 1 ? 300 : 225,stroke:"#176df5","stroke-width":2,class:"teaching-guide"}));
    }
    const overview = $("#overviewSvg");
    overview.replaceChildren(...[...caliperSvg.children].filter(n => !["title","desc"].includes(n.tagName.toLowerCase())).map(n => n.cloneNode(true)));
    overview.querySelectorAll('[tabindex]').forEach(n=>n.removeAttribute('tabindex'));
    updateViewBox();
  }

  function updateViewBox() {
    if (state.dragging) return;
    const mobile = window.innerWidth <= 700;
    if (!mobile && state.viewZoom === 1) {
      caliperSvg.setAttribute("viewBox", `0 0 ${FULL_WIDTH} 560`);
      $("#scaleWindowLabel").textContent = "完整尺身 · 量程 0—150 mm（延伸刻線供對照）";
      return;
    }
    const compact = window.innerWidth <= 1200;
    const baseWidth = compact ? Math.max(650, spm() * 9 + 200) : FULL_WIDTH / state.viewZoom;
    const vernierWidth = spm() * (1 - state.leastCount) * PX_PER_MM + 96;
    const workpieceViewWidth = hasWorkpiece() ? workpieceMm() * PX_PER_MM + vernierWidth + 220 : 0;
    const width = compact ? baseWidth : Math.min(FULL_WIDTH, Math.max(baseWidth, workpieceViewWidth));
    const zeroX = SCALE_X + valueMm() * PX_PER_MM;
    const desiredStart = compact ? zeroX - 110 : hasWorkpiece() ? SCALE_X - 120 : zeroX - width * .3;
    const start = Math.max(0, Math.min(FULL_WIDTH - width, desiredStart));
    caliperSvg.setAttribute("viewBox", `${start} ${compact ? 85 : 0} ${width} ${compact ? 280 : 560}`);
    const firstMm = Math.max(0, Math.floor((start - SCALE_X) / PX_PER_MM));
    const lastMm = Math.min(SCALE_END_MM, Math.ceil((start + width - SCALE_X) / PX_PER_MM));
    $("#scaleWindowLabel").textContent = `${compact ? "刻度特寫" : `刻度放大 ${state.viewZoom}×`} · ${firstMm}—${lastMm} mm`;
  }

  function updateUI() {
    const hidden = isAnswerHidden();
    const value = valueMm();
    const main = mainMm();
    const index = vernierIndex();
    const vernier = vernierValue();
    const contact = isContact();
    const minStep = state.workpieceMode === "outer" ? state.workpieceStep : 0;
    const maxStep = state.workpieceMode === "inner" ? state.workpieceStep : MAX_MM * spm();

    $("#positionRange").min = String(minStep ?? 0);
    $("#positionRange").max = String(maxStep ?? MAX_MM * spm());
    $("#positionRange").value = String(state.step);
    $("#positionOutput").textContent = hidden || (state.mode === "tutorial" && state.readingStep < 4) ? "觀察尺上刻度" : `${fmt(value)} mm`;
    $("#readingValue").textContent = hidden ? "— —" : fmt(value);
    $("#readingLabel").textContent = hidden ? "請讀取刻度" : state.workpieceMode === "outer" ? "目前外徑讀數" : state.workpieceMode === "inner" ? "目前內徑讀數" : "當前讀數";
    $("#precisionNote").textContent = `最小分度 ${state.leastCount} mm`;
    $("#formulaMain").textContent = hidden ? "—" : main;
    $("#formulaIndex").textContent = hidden ? "—" : index;
    $("#formulaLC").textContent = state.leastCount;
    $("#formulaResult").textContent = hidden ? "— mm" : `${fmt(value)} mm`;
    $("#answerPanel").classList.toggle("is-hidden", hidden);
    $("#answerPanel").hidden = hidden || (state.mode === "tutorial" && state.readingStep < 4);
    $("#positionControl").hidden = state.mode === "quiz";
    $("#readingDisplay").hidden = state.mode === "quiz" || (state.mode === "tutorial" && state.readingStep < 4);
    $("#quizAction").hidden = state.mode !== "quiz";
    $("#frameStatus").textContent = state.mode === "quiz" ? "題目位置已鎖定" : contact ? "量爪已接觸 · 量測完成" : state.workpieceMode === "outer" ? "向左收合外測量爪" : state.workpieceMode === "inner" ? "向右張開內測量爪" : "活動量爪可拖曳";
    $("#dragNote").hidden = state.mode === "quiz";
    if (state.mode !== "quiz") $("#dragNote").innerHTML = state.workpieceMode === "outer" ? '<span aria-hidden="true">←</span> 收合至工件表面' : state.workpieceMode === "inner" ? '<span aria-hidden="true">→</span> 張開至孔壁' : '<span aria-hidden="true">↔</span> 拖動活動量爪';
    $("#modeDescription").textContent = modeDescription[state.mode];
    const alignmentLocked = isAnswerHidden();
    $("#alignmentToggle").disabled = alignmentLocked;
    $("#alignmentToggle").setAttribute("aria-pressed", String(canShowAlignment()));
    $("#alignmentToggle").title = alignmentLocked ? "測驗答案揭曉後才可顯示對齊線" : "顯示或隱藏與主尺吻合的游標刻線";
    $("#alignmentLabel").textContent = canShowAlignment() ? "隱藏對齊線" : "顯示對齊線";
    $$("[data-lc]").forEach(button => button.classList.toggle("is-active", Number(button.dataset.lc) === state.leastCount));
    $$("[data-workpiece]").forEach(button => button.classList.toggle("is-active", button.dataset.workpiece === state.workpieceMode));
    $("#stepDown").disabled = state.step <= (minStep ?? 0);
    $("#stepUp").disabled = state.step >= (maxStep ?? MAX_MM * spm());
    $("#resetZero").textContent = hasWorkpiece() ? "快速接觸" : "歸零";
    $("#replaceWorkpiece").hidden = !hasWorkpiece();
    $("#workpieceState").classList.toggle("is-active", hasWorkpiece() && !contact);
    $("#workpieceState").classList.toggle("is-contact", contact);
    $("#workpieceTitle").textContent = !hasWorkpiece() ? "尚未放置工件" : contact ? `${state.workpieceMode === "outer" ? "外徑" : "內徑"}量測完成` : `${state.workpieceMode === "outer" ? "外徑" : "內徑"}工件尚未接觸`;
    $("#workpieceInstruction").textContent = !hasWorkpiece() ? "選擇外徑或內徑開始量測" : contact ? `量測結果 ${fmt(value)} mm` : state.workpieceMode === "outer" ? "向左移動活動量爪，直到貼合工件" : "向右張開內測量爪，直到碰到孔壁";

    const stepText = [
      "先找到游標尺的藍色 0 刻線，確認它落在主尺哪兩格之間。",
      `零線左側最後一個完整刻度是 ${main} mm，所以主尺讀數為 ${main} mm。`,
      `第 ${index} 條游標線與主尺最吻合，游標讀數是 ${index} × ${state.leastCount} = ${fmt(vernier)} mm。`,
      `${main} mm ＋ ${fmt(vernier)} mm ＝ ${fmt(value)} mm。`,
    ][Math.max(0, state.readingStep - 1)];
    $("#stepResult").innerHTML = hidden ? "請先讀取尺上刻度，再按顯示答案。" : `<span>STEP ${String(Math.max(1, state.readingStep)).padStart(2, "0")}</span><p>${safeText(stepText)}</p>`;
    $("#inlineTeaching").hidden = state.mode !== "tutorial";
  }

  function updateAll() { updateUI(); renderCaliper(); }

  function setStep(next) {
    if (state.mode === "quiz") return;
    let min = 0;
    let max = MAX_MM * spm();
    if (state.workpieceMode === "outer") min = state.workpieceStep;
    if (state.workpieceMode === "inner") max = state.workpieceStep;
    state.step = Math.max(min ?? 0, Math.min(max ?? MAX_MM * spm(), Math.round(Number(next))));
    updateAll();
  }

  function setLeastCount(next) {
    const current = valueMm();
    const currentWorkpiece = workpieceMm();
    state.leastCount = Number(next);
    state.step = Math.round(current * spm());
    if (hasWorkpiece()) state.workpieceStep = Math.round(currentWorkpiece * spm());
    if (state.workpieceMode === "outer") state.step = Math.max(state.step, state.workpieceStep);
    if (state.workpieceMode === "inner") state.step = Math.min(state.step, state.workpieceStep);
    if (state.mode === "quiz") newQuestion();
    updateAll();
  }

  function generateWorkpiece(mode = state.workpieceMode) {
    const minMm = mode === "outer" ? 12 : 20;
    const maxMm = mode === "outer" ? 72 : 88;
    const min = minMm * spm();
    const max = maxMm * spm();
    state.workpieceStep = min + Math.floor(Math.random() * (max - min + 1));
    const offset = (8 + Math.floor(Math.random() * 13)) * spm();
    state.step = mode === "outer"
      ? Math.min(MAX_MM * spm(), state.workpieceStep + offset)
      : Math.max(0, state.workpieceStep - offset);
  }

  function setWorkpieceMode(mode) {
    $(".overview").open = mode !== "none";
    state.workpieceMode = mode;
    state.focusPart = null;
    if (state.mode === "quiz") {
      state.mode = "explore";
      state.answerVisible = true;
      $$("[data-mode]").forEach(button => button.classList.toggle("is-active", button.dataset.mode === "explore"));
    }
    if (mode === "none") state.workpieceStep = null;
    else generateWorkpiece(mode);
    updateAll();
  }

  function quickContact() {
    setStep(hasWorkpiece() ? state.workpieceStep : 0);
  }

  function newQuestion() {
    const min = 2 * spm();
    const max = 142 * spm();
    let next = min + Math.floor(Math.random() * (max - min + 1));
    if (next === state.step) next = Math.min(max, next + 1);
    state.step = next;
    state.answerVisible = false;
    state.showAlignment = false;
    $("#quizPrimary").textContent = "顯示答案";
    $("#quizPrompt").textContent = "請先直接從卡尺上讀數，想好再揭曉。";
  }

  function revealOrNext() {
    if (!state.answerVisible) {
      state.answerVisible = true;
      state.showAlignment = true;
      $("#quizPrimary").textContent = "下一題";
      $("#quizPrompt").textContent = `答案是 ${fmt(valueMm())} mm；紅色線就是吻合刻線。`;
    } else {
      newQuestion();
    }
    updateAll();
  }

  function setMode(mode) {
    state.mode = mode;
    state.focusPart = null;
    state.showAlignment = false;
    $$("[data-mode]").forEach(button => button.classList.toggle("is-active", button.dataset.mode === mode));
    if (mode === "quiz") {
      $(".overview").open = false;
      state.workpieceMode = "none";
      state.workpieceStep = null;
      newQuestion();
    } else state.answerVisible = true;
    if (mode === "tutorial") {
      openTab("reading");
      state.readingStep = 1;
      $$(".reading-steps li").forEach((li, index) => li.classList.toggle("is-current", index === 0));
    }
    updateAll();
    if (mode !== "explore") $(".simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openTab(name) {
    $$('[role="tab"]').forEach(tab => {
      const active = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $$('[role="tabpanel"]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
  }

  caliperSvg.addEventListener("pointerdown", event => {
    if (state.mode === "quiz" || !event.target.closest("[data-slider-hit]")) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(caliperSvg.getScreenCTM().inverse());
    state.dragging = { pointerId: event.pointerId, startX: point.x, startStep: state.step };
    caliperSvg.classList.add("is-dragging");
    caliperSvg.setPointerCapture(event.pointerId);
  });

  caliperSvg.addEventListener("pointermove", event => {
    if (!state.dragging) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(caliperSvg.getScreenCTM().inverse());
    const deltaMm = (point.x - state.dragging.startX) / PX_PER_MM;
    setStep(state.dragging.startStep + deltaMm * spm());
  });

  function endDrag() { state.dragging = null; caliperSvg.classList.remove("is-dragging"); updateAll(); }
  caliperSvg.addEventListener("pointerup", endDrag);
  caliperSvg.addEventListener("pointercancel", endDrag);

  caliperSvg.addEventListener("keydown", event => {
    if (!event.target.matches("[data-slider-hit]") || state.mode === "quiz") return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setStep(state.step + (event.key === "ArrowRight" ? 1 : -1));
    }
  });

  $$("[data-lc]").forEach(button => button.addEventListener("click", () => setLeastCount(button.dataset.lc)));
  $$("[data-set-lc]").forEach(button => button.addEventListener("click", () => {
    setLeastCount(button.dataset.setLc);
    $(".simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $$("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $("#positionRange").addEventListener("input", event => setStep(event.target.value));
  $("#stepDown").addEventListener("click", () => setStep(state.step - 1));
  $("#stepUp").addEventListener("click", () => setStep(state.step + 1));
  $("#resetZero").addEventListener("click", quickContact);
  $$("[data-workpiece]").forEach(button => button.addEventListener("click", () => setWorkpieceMode(button.dataset.workpiece)));
  $$("[data-workpiece-preset]").forEach(button => button.addEventListener("click", () => {
    setWorkpieceMode(button.dataset.workpiecePreset);
    $(".simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("#replaceWorkpiece").addEventListener("click", () => {
    generateWorkpiece();
    updateAll();
  });
  $("#zoomToggle").addEventListener("click", () => {
    state.viewZoom = state.viewZoom === 1 ? 1.85 : 1;
    const enlarged = state.viewZoom > 1;
    $("#zoomToggle").setAttribute("aria-pressed", String(enlarged));
    $("#zoomLabel").textContent = enlarged ? "刻度放大" : "完整尺身";
    $("#zoomValue").textContent = enlarged ? "1.85×" : "1×";
    updateViewBox();
  });
  $("#alignmentToggle").addEventListener("click", () => {
    state.showAlignment = !state.showAlignment;
    updateAll();
  });
  $("#quizPrimary").addEventListener("click", revealOrNext);
  $("#startQuiz").addEventListener("click", () => setMode("quiz"));

  $$("[data-part]").forEach(button => button.addEventListener("click", () => {
    state.focusPart = button.dataset.part;
    renderCaliper();
    $(".simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  $$("[data-reading-step]").forEach(button => button.addEventListener("click", () => {
    state.readingStep = Number(button.dataset.readingStep);
    state.mode = "tutorial";
    state.answerVisible = true;
    state.showAlignment = state.readingStep >= 3;
    $$("[data-mode]").forEach(modeButton => modeButton.classList.toggle("is-active", modeButton.dataset.mode === "tutorial"));
    $$(".reading-steps li").forEach((li, index) => li.classList.toggle("is-current", index === state.readingStep - 1));
    updateAll();
  }));

  const tabs = $$("[role=tab]");
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => openTab(tab.dataset.tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      openTab(tabs[next].dataset.tab);
      tabs[next].focus();
    });
  });

  const helpDialog = $("#helpDialog");
  $("#helpButton").addEventListener("click", () => helpDialog.showModal());
  window.addEventListener("resize", updateViewBox);
  window.addEventListener("keydown", event => {
    if (state.mode !== "quiz" && event.key.toLowerCase() === "r" && !event.target.closest("input, button, dialog")) setStep(0);
    if (state.mode === "quiz" && (event.code === "Space" || event.key === "Enter") && !event.target.closest("button, input, dialog")) {
      event.preventDefault();
      revealOrNext();
    }
  });

  $("#inlineTeaching").append($(".reading-steps"), $("#stepResult"));
  updateAll();
})();
