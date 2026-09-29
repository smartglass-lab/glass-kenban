/* グラス鍵盤 — Glass Kenban
 * 入力: D-pad（矢印キー）とタップ（Enter）のみ。Escape は PC 確認用の補助。
 * 依存ライブラリなし。Canvas + DOM + Web Audio（音はすべて端末内で合成。録音素材なし）。
 * AudioContext は最初のタップ（Enter / クリック）まで作らない（自動再生制限対策）。
 * ?auto=1 で「おてほん」曲を自動演奏（デモ録画用。記録・設定は保存しない）。
 */
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var AUTO = /[?&]auto=1/.test(location.search);

  // ---------- 音名 ----------
  var JA = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
  var EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var WHITE = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
  var PC_COLOR = ['#ff7b7b', '#ff9466', '#ffad5c', '#ffc94d', '#ffe066', '#b5e853', '#6fe08a', '#45dcb4', '#46cde6', '#5eb2ff', '#8a97ff', '#bf9cff'];
  var TONES = ['ピアノ風', 'オルゴール', 'オルガン'];
  function mname(m) { return EN[m % 12] + (Math.floor(m / 12) - 1); }

  // ---------- 曲（パブリックドメインの旋律。 音名+オクターブ:拍 。拍の省略は1拍） ----------
  var SONGS = [
    { id: 'kirakira', ja: 'きらきら星', by: 'フランス民謡', bpm: 120,
      src: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
    { id: 'kaeru', ja: 'かえるの合唱', by: 'ドイツ民謡', bpm: 132,
      src: 'C4 D4 E4 F4 E4 D4 C4:2 E4 F4 G4 A4 G4 F4 E4:2 C4:2 C4:2 C4:2 C4:2 C4:.5 C4:.5 D4:.5 D4:.5 E4:.5 E4:.5 F4:.5 F4:.5 E4 D4 C4:2' },
    { id: 'mary', ja: 'メリーさんのひつじ', by: 'アメリカ民謡', bpm: 126,
      src: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4' },
    { id: 'london', ja: 'ロンドン橋', by: 'イギリス民謡', bpm: 116,
      src: 'G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3' },
    { id: 'joy', ja: 'よろこびの歌', by: 'ベートーヴェン「第九」', bpm: 120,
      src: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2 ' +
           'D4 D4 E4 C4 D4 E4:.5 F4:.5 E4 C4 D4 E4:.5 F4:.5 E4 D4 C4 D4 G3:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2' }
  ];
  function parseSong(s) {
    var notes = s.src.split(/\s+/).map(function (tok) {
      var p = tok.split(':');
      var mm = /^([A-G]#?)(\d)$/.exec(p[0]);
      return { m: EN.indexOf(mm[1]) + (parseInt(mm[2], 10) + 1) * 12, b: p[1] ? parseFloat(p[1]) : 1 };
    });
    var lo = Math.min.apply(null, notes.map(function (n) { return n.m; }));
    s.oct = Math.floor(lo / 12) - 1;           // 曲が収まるオクターブ（C<oct>〜C<oct+2>）
    var base = (s.oct + 1) * 12;
    notes.forEach(function (n) { n.i = n.m - base; });
    s.notes = notes;
  }
  SONGS.forEach(parseSong);

  // ---------- 状態 ----------
  var mode = 'title', menuIdx = 0, menuItems = [], menuEl = 'title-list', howtoFrom = 'title', songsFrom = 'title';
  var oct = 4, freeOct = 4, cur = 0, tone = 0, easy = false;
  var song = -1, pos = 0, miss = 0, startT = 0;
  var parts = [], flashes = {}, beams = [], toast = { msg: '', t: -9999 };
  var rec = {};
  var listen = null, ap = null;
  var clearTimer = 0;

  // ---------- 保存 ----------
  var KEY = 'glass-kenban-v1';
  function save() {
    if (AUTO) return;
    try { localStorage.setItem(KEY, JSON.stringify({ tone: tone, easy: easy, oct: freeOct, rec: rec })); }
    catch (e) { /* 保存できなくても動作には影響しない */ }
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      if (s.tone >= 0 && s.tone < 3) tone = s.tone;
      if (typeof s.easy === 'boolean') easy = s.easy;
      if (s.oct >= 2 && s.oct <= 5) freeOct = s.oct;
      if (s.rec && typeof s.rec === 'object') rec = s.rec;
    } catch (e) { /* 壊れていたら初期値のまま */ }
    if (AUTO) easy = false;
  }

  // ---------- 音（Web Audio で合成） ----------
  var actx = null, master = null;
  function ensureAudio() {
    if (!actx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
        var comp = actx.createDynamicsCompressor();
        master = actx.createGain();
        master.gain.value = 0.6;
        master.connect(comp);
        comp.connect(actx.destination);
      } catch (e) { actx = null; return; }
    }
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) { /* noop */ } }
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // 1つの倍音: 立ち上がり a 秒 → (hold 秒保持) → d 秒で減衰
  function partial(dest, type, f, amp, t, a, d, hold) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + a);
    if (hold) g.gain.setValueAtTime(amp, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + d);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + (hold || 0) + d + 0.05);
  }
  function playNote(m, delay) {
    if (!actx || !master) return;
    var t = actx.currentTime + (delay || 0), f = mtof(m);
    if (tone === 0) { // ピアノ風: 三角波+倍音、明るさが落ちていく減衰
      var dur = Math.max(0.9, 2.6 - (m - 48) * 0.035);
      var lp = actx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(9000, f * 10), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), t + dur * 0.7);
      lp.connect(master);
      partial(lp, 'triangle', f, 0.42, t, 0.004, dur);
      partial(lp, 'sine', f * 2, 0.14, t, 0.004, dur * 0.55);
      partial(lp, 'sine', f * 3, 0.06, t, 0.003, dur * 0.3);
      partial(lp, 'square', f, 0.03, t, 0.002, 0.12);
    } else if (tone === 1) { // オルゴール: 正弦波+高い倍音、短い立ち上がりと長い余韻
      partial(master, 'sine', f * 2, 0.34, t, 0.002, 1.7);
      partial(master, 'sine', f * 4, 0.10, t, 0.001, 0.35);
      partial(master, 'sine', f * 6.02, 0.05, t, 0.001, 0.15);
    } else { // オルガン: ドローバー風の倍音を保持してから離す
      var h = 0.42;
      partial(master, 'sine', f, 0.22, t, 0.015, 0.35, h);
      partial(master, 'sine', f * 2, 0.14, t, 0.015, 0.35, h);
      partial(master, 'sine', f * 3, 0.09, t, 0.015, 0.3, h);
      partial(master, 'sine', f * 4, 0.05, t, 0.015, 0.25, h);
    }
  }

  // ---------- 鍵盤の形 ----------
  var KX0 = 66, KX1 = 592, KY = 352, KH = 204, BH = 128;
  var WW = (KX1 - KX0) / 15, BW = WW * 0.62;
  var MX = 8, MW = 50; // メニュー枠（鍵盤の左はし）
  var KEYS = [];
  (function () {
    var wi = 0;
    for (var i = 0; i < 25; i++) {
      if (WHITE[i % 12]) { KEYS.push({ w: true, x: KX0 + wi * WW, wd: WW }); wi++; }
      else KEYS.push({ w: false, x: KX0 + wi * WW - BW / 2, wd: BW });
    }
  })();
  function keyCenter(i) { return KEYS[i].x + KEYS[i].wd / 2; }
  function baseMidi() { return (oct + 1) * 12; }
  function S() { return song >= 0 ? SONGS[song] : null; }
  function targetIdx() { var s = S(); return s && pos < s.notes.length ? s.notes[pos].i : -99; }
  function nowMs() { return performance.now(); }

  // ---------- 演奏 ----------
  function sound(idx, ok) {
    var m = baseMidi() + idx, t = nowMs();
    playNote(m);
    flashes[idx] = { t: t, ok: ok };
    beams.push({ i: idx, t: t, ok: ok });
    parts.push({ x: keyCenter(idx), m: m, t: t, ok: ok, ph: Math.random() * 6.28, g: Math.random() < 0.5 ? '♪' : '♫' });
    if (parts.length > 40) parts.shift();
  }
  function press() {
    if (cur < 0) { openMenu(); return; }
    var s = S(), idx = cur, ok = true;
    if (s) {
      ok = idx === targetIdx();
      if (ok) {
        pos++;
        if (pos >= s.notes.length) { sound(idx, ok); finish(); return; }
        if (easy) cur = targetIdx();
      } else miss++;
    }
    sound(idx, ok);
  }
  function finish() {
    var s = S(), secs = Math.round((nowMs() - startT) / 1000);
    var r = rec[s.id] || { clear: 0, best: null };
    var newBest = r.best === null || miss < r.best;
    r.clear++;
    if (newBest) r.best = miss;
    rec[s.id] = r; save();
    ap = null;
    mode = 'clearwait';
    [0, 4, 7, 12].forEach(function (d, k) { playNote(72 + d, 0.35 + k * 0.11); });
    clearTimer = setTimeout(function () { openClear(secs, newBest); }, AUTO ? 750 : 1100);
  }
  function fmtTime(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  // おてほんを聴く（鍵が順に光る）
  function startListen() {
    var s = S(); if (!s) return;
    backToPlay();
    listen = { i: 0, next: nowMs() + 700 };
    renderHint();
  }
  function stopListen() {
    if (!listen) return;
    listen = null; pos = 0; miss = 0; startT = nowMs();
    cur = S() ? S().notes[0].i : cur;
    renderHint();
  }

  // ---------- 描画 ----------
  var cv = el('cv'), ctx = cv.getContext('2d');
  var FONT = '"Hiragino Sans","Noto Sans JP",sans-serif';
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.closePath();
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function drawKey(i, t, tgt) {
    var k = KEYS[i], h = k.w ? KH : BH, x = k.x + (k.w ? 1.5 : 0), w = k.wd - (k.w ? 3 : 0);
    var pc = (baseMidi() + i) % 12;
    rr(x, KY, w, h, k.w ? 7 : 4);
    ctx.fillStyle = k.w ? '#2a2e38' : '#0b0c10';
    ctx.fill();
    if (i === tgt) {
      ctx.fillStyle = 'rgba(255,209,102,' + (0.32 + 0.22 * Math.sin(t / 170)) + ')';
      ctx.fill();
    }
    var f = flashes[i];
    if (f) {
      var a = 1 - (t - f.t) / 420;
      if (a > 0) { ctx.fillStyle = f.ok ? hexA(PC_COLOR[pc], 0.85 * a) : 'rgba(255,90,90,' + (0.7 * a) + ')'; ctx.fill(); }
      else delete flashes[i];
    }
    if (i === cur) { ctx.fillStyle = 'rgba(124,231,255,0.2)'; ctx.fill(); }
    ctx.lineWidth = i === cur ? 3 : (i === tgt ? 2.5 : 1.5);
    ctx.strokeStyle = i === cur ? '#7ce7ff' : (i === tgt ? '#ffd166' : (k.w ? '#4c5364' : '#454b5a'));
    ctx.stroke();
    // 音名
    var col = i === cur ? '#7ce7ff' : (i === tgt ? '#ffd166' : '#aab2c2');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (k.w) {
      ctx.font = '800 15px ' + FONT; ctx.fillStyle = col;
      ctx.fillText(JA[pc], x + w / 2, KY + KH - 17);
      if (pc === 0) { ctx.font = '700 11px ' + FONT; ctx.fillStyle = '#7a8394'; ctx.fillText(mname(baseMidi() + i), x + w / 2, KY + KH - 38); }
    } else if (i === cur || i === tgt) {
      ctx.font = '800 11px ' + FONT; ctx.fillStyle = col;
      ctx.fillText(JA[pc], x + w / 2, KY + BH - 14);
    }
  }
  function drawKeyboard(t) {
    var tgt = listen ? -99 : targetIdx();
    var i;
    for (i = 0; i < 25; i++) if (KEYS[i].w) drawKey(i, t, tgt);
    for (i = 0; i < 25; i++) if (!KEYS[i].w) drawKey(i, t, tgt);
    // メニュー枠
    rr(MX, KY, MW, KH, 7);
    ctx.fillStyle = cur < 0 ? 'rgba(124,231,255,0.2)' : '#1c1f27'; ctx.fill();
    ctx.lineWidth = cur < 0 ? 3 : 1.5; ctx.strokeStyle = cur < 0 ? '#7ce7ff' : '#3a404e'; ctx.stroke();
    ctx.fillStyle = cur < 0 ? '#7ce7ff' : '#9aa3b5';
    ctx.font = '800 26px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('≡', MX + MW / 2, KY + 40);
    ctx.font = '700 15px ' + FONT;
    ['メ', 'ニ', 'ュ', 'ー'].forEach(function (c, k) { ctx.fillText(c, MX + MW / 2, KY + 84 + k * 22); });
    // カーソル下のバー
    ctx.fillStyle = '#7ce7ff';
    if (cur < 0) ctx.fillRect(MX + 6, KY + KH + 5, MW - 12, 5);
    else ctx.fillRect(KEYS[cur].x + 4, KY + KH + 5, KEYS[cur].wd - 8, 5);
    // 次の鍵のマーカー
    if (tgt >= 0) {
      var bx = keyCenter(tgt), by = KY - 16 + Math.sin(t / 150) * 3;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(bx - 9, by - 8); ctx.lineTo(bx + 9, by - 8); ctx.lineTo(bx, by + 5); ctx.closePath(); ctx.fill();
    }
  }
  function drawFlow(t) {
    // 光の柱
    for (var j = beams.length - 1; j >= 0; j--) {
      var b = beams[j], a = 1 - (t - b.t) / 500;
      if (a <= 0) { beams.splice(j, 1); continue; }
      var k = KEYS[b.i], cx = keyCenter(b.i), w = k.wd * 0.8;
      var pc = (baseMidi() + b.i) % 12;
      var g = ctx.createLinearGradient(0, KY, 0, KY - 190);
      g.addColorStop(0, b.ok ? hexA(PC_COLOR[pc], 0.45 * a) : 'rgba(255,90,90,' + 0.35 * a + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - w / 2, KY - 190, w, 190);
    }
    // 流れる音符
    ctx.save();
    ctx.beginPath(); ctx.rect(0, S() ? 146 : 76, 600, KY - (S() ? 146 : 76)); ctx.clip();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i], age = (t - p.t) / 1000, al = 1 - age / 3.4;
      if (al <= 0) { parts.splice(i, 1); continue; }
      var y = KY - 30 - age * 78, x = p.x + Math.sin(p.ph + age * 2.4) * 10;
      var c = p.ok ? PC_COLOR[p.m % 12] : '#ff6b6b';
      ctx.globalAlpha = Math.min(1, al * 1.3);
      ctx.font = '800 32px ' + FONT; ctx.fillStyle = c;
      ctx.fillText(p.g, x, y);
      ctx.font = '800 14px ' + FONT;
      ctx.fillText(p.ok ? JA[p.m % 12] : '×', x, y + 24);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  function drawTop(t) {
    var s = S();
    ctx.textBaseline = 'middle';
    if (!s) {
      ctx.textAlign = 'left'; ctx.font = '800 17px ' + FONT; ctx.fillStyle = '#9aa3b5';
      ctx.fillText('じゆうにひく', 18, 58);
      ctx.textAlign = 'right';
      if (cur >= 0) {
        var m = baseMidi() + cur;
        ctx.font = '800 22px ' + FONT; ctx.fillStyle = '#7ce7ff';
        ctx.fillText(JA[m % 12] + '  ' + mname(m), 582, 58);
      } else { ctx.font = '800 18px ' + FONT; ctx.fillStyle = '#7ce7ff'; ctx.fillText('≡ メニュー', 582, 58); }
      return;
    }
    var n = s.notes.length, at = listen ? listen.i : pos;
    ctx.textAlign = 'left'; ctx.font = '800 19px ' + FONT; ctx.fillStyle = '#ffd166';
    ctx.fillText('♪ ' + s.ja, 18, 58);
    if (easy && !listen) {
      var tw = ctx.measureText('♪ ' + s.ja).width;
      ctx.font = '800 13px ' + FONT; ctx.fillStyle = '#7ce7ff';
      ctx.fillText('かんたん', 30 + tw, 59);
    }
    ctx.textAlign = 'right'; ctx.font = '800 17px ' + FONT;
    if (listen) { ctx.fillStyle = '#7ce7ff'; ctx.fillText('▶ おてほん再生中', 582, 58); }
    else { ctx.fillStyle = '#dfe4ee'; ctx.fillText(Math.min(at + 1, n) + ' / ' + n + '　ミス ' + miss, 582, 58); }
    // これからひく音のならび
    var CX = 170, SP = 52;
    for (var k = -2; k <= 7; k++) {
      var j = at + k;
      if (j < 0 || j >= n) continue;
      var x = CX + k * SP, isCur = k === 0, r = isCur ? 25 : 20;
      var pc = (baseMidi() + s.notes[j].i) % 12;
      ctx.globalAlpha = k < 0 ? 0.3 : (k > 4 ? 0.55 : 1);
      ctx.beginPath(); ctx.arc(x, 104, r, 0, Math.PI * 2);
      ctx.fillStyle = isCur ? 'rgba(255,209,102,0.22)' : '#1c1f27'; ctx.fill();
      ctx.lineWidth = isCur ? 3 : 2; ctx.strokeStyle = isCur ? '#ffd166' : PC_COLOR[pc]; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '800 ' + (isCur ? (JA[pc].length > 1 ? 16 : 20) : (JA[pc].length > 1 ? 13 : 16)) + 'px ' + FONT;
      ctx.fillStyle = isCur ? '#ffd166' : '#dfe4ee';
      ctx.fillText(JA[pc], x, 105);
    }
    ctx.globalAlpha = 1;
    // 進みぐあい
    ctx.fillStyle = '#1c1f27'; ctx.fillRect(20, 138, 560, 5);
    ctx.fillStyle = listen ? '#7ce7ff' : '#ffd166'; ctx.fillRect(20, 138, 560 * at / n, 5);
  }
  function drawToast(t) {
    var age = t - toast.t;
    if (age > 1300) return;
    ctx.globalAlpha = age > 1000 ? 1 - (age - 1000) / 300 : 1;
    ctx.font = '800 26px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(toast.msg).width + 44;
    rr(300 - w / 2, 226, w, 48, 12); ctx.fillStyle = '#14161c'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7ce7ff'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillText(toast.msg, 300, 251);
    ctx.globalAlpha = 1;
  }
  function showToast(msg) { toast = { msg: msg, t: nowMs() }; }
  function draw(t) {
    ctx.clearRect(0, 0, 600, 600);
    drawFlow(t);
    drawTop(t);
    drawKeyboard(t);
    drawToast(t);
  }
  function renderHud() {
    el('hud-right').textContent = TONES[tone] + ' ・ C' + oct + '〜C' + (oct + 2);
  }
  function renderHint() {
    var h;
    if (listen) h = 'おてほん再生中 — どれかを押すと止まって、ひく番に';
    else if (S()) h = easy ? '金色の鍵をタップ（カーソルは自動）　左はし ≡ メニュー' : '←→ 金色の鍵へ　タップ ならす　左はし ≡ メニュー';
    else h = '←→ 鍵をえらぶ　タップ ならす　↑↓ オクターブ　左はし ≡';
    el('hint').textContent = h;
  }

  // ---------- 自動演奏（?auto=1 と おてほんを聴く） ----------
  function tick(t) {
    var s = S();
    if (listen && mode === 'play' && s) {
      if (t >= listen.next) {
        var n = s.notes[listen.i];
        cur = n.i;
        sound(n.i, true);
        listen.i++;
        listen.next = t + n.b * 60000 / s.bpm;
        if (listen.i >= s.notes.length) {
          listen = null; pos = 0; miss = 0; startT = t + 800;
          cur = s.notes[0].i;
          showToast('こんどは ひいてみよう');
          renderHint();
        }
      }
      return;
    }
    if (!AUTO || mode !== 'play' || !s) { ap = null; return; }
    if (!ap) ap = { tapAt: t + 700, stepAt: t + 400, stepMs: 110 };
    var tgt = targetIdx();
    if (tgt < 0) return;
    if (cur !== tgt && t >= ap.stepAt) { cur += cur < tgt ? 1 : -1; ap.stepAt = t + ap.stepMs; }
    if (cur === tgt && t >= ap.tapAt) {
      var dur = s.notes[pos].b * 60000 / s.bpm;
      press();
      if (mode !== 'play') return;
      var nt = targetIdx(), steps = Math.abs(nt - cur);
      ap.tapAt = t + dur;
      ap.stepMs = steps ? Math.min(110, dur * 0.6 / steps) : 0;
      ap.stepAt = t + Math.min(130, dur * 0.2);
    }
  }

  function loop(t) {
    if (mode === 'play' || mode === 'clear' || mode === 'clearwait') {
      tick(t);
      draw(t);
    }
    requestAnimationFrame(loop);
  }

  // ---------- 画面 ----------
  var SCREENS = ['title', 'play', 'menu', 'songs', 'howto'];
  function show(id) {
    for (var i = 0; i < SCREENS.length; i++) el(SCREENS[i]).classList.toggle('hidden', SCREENS[i] !== id);
    el('hud').classList.toggle('hidden', id === 'title');
    el('clear').classList.add('hidden');
    renderHud();
  }
  function renderList() {
    var box = el(menuEl);
    box.innerHTML = '';
    menuItems.forEach(function (it, i) {
      var b = document.createElement('div');
      b.className = 'rail-btn' + (i === menuIdx ? ' cur' : '');
      b.innerHTML = '<span>' + it.label + '</span>' + (it.sub ? '<small' + (it.on ? ' class="on"' : '') + '>' + it.sub + '</small>' : '');
      b.addEventListener('click', function () { ensureAudio(); menuIdx = i; renderList(); it.act(); });
      box.appendChild(b);
    });
  }
  function setList(elId, items, keepIdx) {
    menuEl = elId; menuItems = items;
    if (!keepIdx || menuIdx >= items.length) menuIdx = 0;
    renderList();
  }
  function recSub(s) {
    var r = rec[s.id];
    if (!r || !r.clear) return s.by;
    return (r.best === 0 ? '★ ノーミス' : '✓ ベスト ミス' + r.best);
  }
  function openTitle() {
    clearTimeout(clearTimer); listen = null; ap = null;
    mode = 'title';
    show('title');
    setList('title-list', [
      { label: '▶ じゆうにひく', sub: TONES[tone], act: startFree },
      { label: '♪ おてほん', sub: '5曲', act: function () { openSongs('title'); } },
      { label: 'つかいかた', act: function () { openHowto('title'); } }
    ]);
  }
  function startFree() {
    song = -1; oct = freeOct; listen = null;
    if (cur < 0 || cur > 24) cur = 12;
    backToPlay();
  }
  function startSong(i) {
    clearTimeout(clearTimer);
    song = i; pos = 0; miss = 0; listen = null; ap = null;
    oct = SONGS[i].oct;
    cur = SONGS[i].notes[0].i;
    startT = nowMs();
    parts = []; beams = []; flashes = {};
    backToPlay();
    showToast('♪ ' + SONGS[i].ja);
  }
  function backToPlay() {
    mode = 'play';
    show('play');
    renderHint();
  }
  function openSongs(from) {
    listen = null;
    mode = 'songs'; songsFrom = from;
    show('songs');
    var items = [{ label: '← もどる', act: function () { from === 'menu' ? openMenu() : openTitle(); } }];
    items.push({ label: 'かんたん', sub: easy ? 'ON（タップだけ）' : 'OFF（←→で移動）', on: easy, act: function () { easy = !easy; save(); openSongsKeep(from); } });
    SONGS.forEach(function (s, i) { items.push({ label: s.ja, sub: recSub(s), act: function () { startSong(i); } }); });
    items.push({ label: 'じゆうにひく', act: startFree });
    setList('songs-list', items, keepFlag);
    keepFlag = false;
  }
  var keepFlag = false;
  function openSongsKeep(from) { keepFlag = true; openSongs(from); }
  function openMenu() {
    listen = null; ap = null;
    var keep = keepFlag; keepFlag = false;
    mode = 'menu';
    show('menu');
    var s = S();
    el('menu-sub').innerHTML = s ? '<b>♪ ' + s.ja + '</b>　' + Math.min(pos + 1, s.notes.length) + ' / ' + s.notes.length + ' 音目' : 'じゆうにひく　C' + oct + '〜C' + (oct + 2);
    var items = [
      { label: '← もどる', act: backToPlay },
      { label: '音色', sub: TONES[tone] + ' ▸', on: true, act: function () { tone = (tone + 1) % 3; save(); ensureAudio(); playNote(72); keepFlag = true; openMenu(); } },
      { label: 'おてほん曲', sub: s ? s.ja : 'えらぶ', act: function () { openSongs('menu'); } },
      { label: 'かんたん', sub: easy ? 'ON' : 'OFF', on: easy, act: function () { easy = !easy; save(); if (easy && S()) cur = targetIdx(); keepFlag = true; openMenu(); } }
    ];
    if (s) {
      items.push({ label: 'おてほんを聴く', act: startListen });
      items.push({ label: 'さいしょから', act: function () { startSong(song); } });
    }
    items.push({ label: 'つかいかた', act: function () { openHowto('menu'); } });
    items.push({ label: 'タイトルへ', act: openTitle });
    setList('menu-list', items, keep);
  }
  function openHowto(from) {
    mode = 'howto'; howtoFrom = from;
    show('howto');
    setList('howto-list', [{ label: '← もどる', act: function () { from === 'menu' ? openMenu() : openTitle(); } }]);
  }
  function openClear(secs, newBest) {
    var s = S();
    mode = 'clear';
    el('clear').classList.remove('hidden');
    el('clear-sub').innerHTML = '<b>♪ ' + s.ja + '</b>　ミス ' + miss + '　' + fmtTime(secs) +
      (miss === 0 ? '<br>ノーミス！' : (newBest ? '<br>ベスト更新！' : ''));
    var nx = (song + 1) % SONGS.length;
    setList('clear-list', [
      { label: 'もういちど', act: function () { startSong(song); } },
      { label: 'つぎの曲 ▶', sub: SONGS[nx].ja, act: function () { startSong(nx); } },
      { label: '曲をえらぶ', act: function () { openSongs('title'); } },
      { label: 'じゆうにひく', act: startFree }
    ]);
  }

  // ---------- 入力 ----------
  function move(dir) {
    if (!menuItems.length) return;
    menuIdx = (menuIdx + dir + menuItems.length) % menuItems.length;
    renderList();
  }
  function shiftOct(d) {
    var n = Math.max(2, Math.min(5, oct + d));
    if (n === oct) { showToast(d > 0 ? 'これより高くはできません' : 'これより低くはできません'); return; }
    oct = n;
    if (!S()) { freeOct = oct; save(); }
    showToast('C' + oct + '〜C' + (oct + 2));
    renderHud();
  }
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'].indexOf(k) < 0) return;
    e.preventDefault();
    if (k === ' ') k = 'Enter';
    if (k === 'Enter') ensureAudio();
    if (mode === 'clearwait') return;
    if (mode === 'play') {
      if (listen) { stopListen(); return; }
      if (k === 'ArrowRight') cur = cur >= 24 ? -1 : cur + 1;
      else if (k === 'ArrowLeft') cur = cur <= -1 ? 24 : cur - 1;
      else if (k === 'ArrowUp') shiftOct(1);
      else if (k === 'ArrowDown') shiftOct(-1);
      else if (k === 'Enter') press();
      else if (k === 'Escape') openMenu();
      return;
    }
    // リスト画面（title / menu / songs / howto / clear）
    if (k === 'ArrowUp' || k === 'ArrowLeft') move(-1);
    else if (k === 'ArrowDown' || k === 'ArrowRight') move(1);
    else if (k === 'Enter') menuItems[menuIdx].act();
    else if (k === 'Escape') {
      if (mode === 'menu') backToPlay();
      else if (mode === 'howto') (howtoFrom === 'menu' ? openMenu : openTitle)();
      else if (mode === 'songs') (songsFrom === 'menu' ? openMenu : openTitle)();
      else if (mode === 'clear') openSongs('title');
    }
  });
  // PC 確認用: 鍵盤をクリックして鳴らす
  cv.addEventListener('click', function (e) {
    if (mode !== 'play') return;
    ensureAudio();
    if (listen) { stopListen(); return; }
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, hit = null, i;
    if (x >= MX && x <= MX + MW && y >= KY && y <= KY + KH) { openMenu(); return; }
    if (y >= KY && y <= KY + BH) for (i = 0; i < 25; i++) if (!KEYS[i].w && x >= KEYS[i].x && x <= KEYS[i].x + KEYS[i].wd) hit = i;
    if (hit === null && y >= KY && y <= KY + KH) for (i = 0; i < 25; i++) if (KEYS[i].w && x >= KEYS[i].x && x <= KEYS[i].x + KEYS[i].wd) hit = i;
    if (hit === null) return;
    cur = hit; press();
  });

  // ---------- 起動 ----------
  load();
  oct = freeOct;
  cur = 12;
  openTitle();
  requestAnimationFrame(loop);
})();
