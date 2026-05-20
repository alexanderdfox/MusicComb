import { Midi } from "https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/+esm";
import {
  midiToComb,
  hurrianDefault,
  buildConfig,
  DEFAULT_DIMS,
} from "./midi-comb.js";
import { downloadBlob, downloadStlPair } from "./stl-export.js";
import { CombAudio, midiToLabel } from "./comb-audio.js";

const $ = (sel) => document.querySelector(sel);

const SOURCE = { HURRIAN: "hurrian", MIDI: "midi" };

const combAudio = new CombAudio();

let state = {
  source: SOURCE.HURRIAN,
  midi: null,
  fileName: "",
  result: hurrianDefault(54),
  spinAngle: 0,
  animating: false,
  lastPluckedIndex: -1,
  animLastTime: 0,
};

const canvas = $("#preview");
const ctx = canvas.getContext("2d");

function slug(name) {
  return (name || "song")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 40);
}

function readControls() {
  return {
    numProngs: parseInt($("#numProngs").value, 10),
    trackIndex: parseInt($("#trackSelect").value, 10) || 0,
    useAllTracks: $("#useAllTracks").checked,
    mapping: $("#mapping").value,
    dims: {
      ...DEFAULT_DIMS,
      minProngLen: parseFloat($("#minLen").value),
      maxProngLen: parseFloat($("#maxLen").value),
      minMidi: parseInt($("#minMidi").value, 10),
      maxMidi: parseInt($("#maxMidi").value, 10),
    },
  };
}

function setSource(source) {
  state.source = source;
  const isHurrian = source === SOURCE.HURRIAN;

  document.querySelectorAll(".source-tab").forEach((tab) => {
    const active = tab.dataset.source === source;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  $("#panelHurrian").classList.toggle("is-hidden", !isHurrian);
  $("#panelHurrian").setAttribute("aria-hidden", isHurrian ? "false" : "true");
  $("#panelMidi").classList.toggle("is-hidden", isHurrian);
  $("#panelMidi").setAttribute("aria-hidden", isHurrian ? "true" : "false");

  if (isHurrian) {
    loadHurrianDefault();
  } else {
    recompute();
  }
}

function loadHurrianDefault() {
  state.midi = null;
  state.fileName = "";
  state.source = SOURCE.HURRIAN;
  $("#songName").value = "hurrian-hymn";
  $("#fileLabel").textContent = "No file loaded";
  $("#midiFile").value = "";
  $("#trackSelect").innerHTML = "";
  $("#trackSelect").disabled = true;
  const opts = readControls();
  state.result = hurrianDefault(opts.numProngs);
  state.result.source = "hurrian";
  state.result.numProngs = opts.numProngs;
  updateMeta();
  updateStatus();
  drawPreview();
}

function updateTrackSelect(midi) {
  const sel = $("#trackSelect");
  sel.innerHTML = "";
  midi.tracks.forEach((t, i) => {
    const opt = document.createElement("option");
    const name = t.name || `Track ${i + 1}`;
    opt.value = String(i);
    opt.textContent = `${name} (${t.notes.length})`;
    sel.appendChild(opt);
  });
  sel.disabled = midi.tracks.length === 0;
}

function recompute() {
  const opts = readControls();
  if (state.source === SOURCE.MIDI && state.midi) {
    state.result = midiToComb(state.midi, opts);
    state.result.source = "midi";
  } else {
    state.result = hurrianDefault(opts.numProngs);
    state.result.source = "hurrian";
  }
  state.result.numProngs = opts.numProngs;
  updateMeta();
  updateStatus();
  drawPreview();
}

function playbackDurationSec() {
  const r = state.result;
  const n = r.lengths?.length ?? 54;
  return r.duration > 0 ? r.duration : Math.max(6, n * 0.19);
}

function velocityForProng(index) {
  const slot = state.result.slots?.[index];
  if (slot?.notes?.length) {
    return Math.max(
      0.35,
      ...slot.notes.map((n) => (n.velocity ?? 0.7))
    );
  }
  return 0.72;
}

function activeProngIndex(spinAngle, n) {
  if (n <= 0) return -1;
  const t = ((spinAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor((t / (Math.PI * 2)) * n) % n;
}

function tryPluckProng(index) {
  if (index < 0 || index === state.lastPluckedIndex) return;
  state.lastPluckedIndex = index;
  const pitch = state.result.pitches?.[index];
  if (pitch == null || !$("#playAudio").checked || combAudio.muted) return;
  combAudio.pluck(pitch, velocityForProng(index));
}

function updateMeta() {
  const r = state.result;
  const dur = playbackDurationSec();
  $("#metaDuration").textContent = dur ? `${dur.toFixed(1)}s` : "—";
  $("#metaProngs").textContent = r.lengths.length;
  const lo = Math.min(...r.lengths).toFixed(0);
  const hi = Math.max(...r.lengths).toFixed(0);
  $("#metaRange").textContent = `${lo}–${hi} mm`;
}

function updateStatus() {
  const label =
    state.source === SOURCE.HURRIAN
      ? "Hurrian Hymn — align arrow with ▲, spin counter-clockwise"
      : state.midi
        ? `${state.fileName} — spin CCW to play`
        : "Load a MIDI file or switch to Hurrian Hymn";
  $("#statusLine").textContent = label;
}

function drawPreview() {
  const showSpinner = $("#showSpinner").checked;
  const lengths = state.result.lengths;
  const n = lengths.length;
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = size / 2;
  const cy = size / 2;
  const dims = readControls().dims;
  const maxTip = dims.hubRadius + dims.maxProngLen + 14;
  const scale = (size * 0.42) / maxTip;

  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = "#252b38";
  ctx.lineWidth = 1;
  for (let r = 10; r <= maxTip; r += 10) {
    ctx.beginPath();
    ctx.arc(0, 0, r * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  const hubR = dims.hubRadius * scale;
  ctx.fillStyle = "#3a4254";
  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.fill();

  const spin = state.spinAngle;
  const rakeCanvasAng = -Math.PI / 2 + spin;

  if (showSpinner) {
    const maxLen = Math.max(...lengths);
    const ringIn = (dims.hubRadius + maxLen + 1.5) * scale;
    const ringOut = ringIn + 12 * scale;
    ctx.save();
    ctx.rotate(spin);
    ctx.strokeStyle = "rgba(201, 162, 39, 0.45)";
    ctx.lineWidth = ringOut - ringIn;
    ctx.beginPath();
    ctx.arc(0, 0, (ringIn + ringOut) / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(228, 192, 74, 0.9)";
    ctx.lineWidth = Math.max(2.5, scale * 1.2);
    const rSpine0 = hubR * 1.05;
    const rSpine1 = ringIn * 0.98;
    ctx.beginPath();
    ctx.moveTo(
      Math.cos(rakeCanvasAng) * rSpine0,
      Math.sin(rakeCanvasAng) * rSpine0
    );
    ctx.lineTo(
      Math.cos(rakeCanvasAng) * rSpine1,
      Math.sin(rakeCanvasAng) * rSpine1
    );
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n - Math.PI / 2;
    const len = lengths[i];
    const r0 = dims.hubRadius * scale;
    const r1 = (dims.hubRadius + len) * scale;
    const t =
      (len - dims.minProngLen) / (dims.maxProngLen - dims.minProngLen || 1);
    ctx.strokeStyle = `hsl(${205 + t * 70}, 65%, 60%)`;
    ctx.lineWidth = Math.max(2, scale * 1.05);
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
    ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
    ctx.stroke();
  }

  ctx.fillStyle = "#e4c04a";
  ctx.beginPath();
  const markAng = -Math.PI / 2;
  ctx.moveTo(Math.cos(markAng) * hubR * 1.1, Math.sin(markAng) * hubR * 1.1);
  ctx.lineTo(
    Math.cos(markAng + 0.06) * hubR * 1.7,
    Math.sin(markAng + 0.06) * hubR * 1.7
  );
  ctx.lineTo(
    Math.cos(markAng - 0.06) * hubR * 1.7,
    Math.sin(markAng - 0.06) * hubR * 1.7
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  const active =
    showSpinner && state.animating && n > 0
      ? activeProngIndex(spin, n)
      : -1;
  if (active >= 0) {
    const aa = (2 * Math.PI * active) / n - Math.PI / 2;
    ctx.strokeStyle = "rgba(255, 110, 80, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(aa) * ((dims.hubRadius + lengths[active]) * scale),
      cy + Math.sin(aa) * ((dims.hubRadius + lengths[active]) * scale),
      scale * 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    const label = midiToLabel(state.result.pitches[active]);
    $("#statusLine").textContent = `Playing — prong ${active + 1}/${n} · ${label}`;
  }
}

function tickAnimation(timestamp) {
  if (!state.animating) return;

  const dt =
    state.animLastTime > 0
      ? Math.min(0.05, (timestamp - state.animLastTime) / 1000)
      : 0;
  state.animLastTime = timestamp;

  const n = state.result.lengths.length;
  const duration = playbackDurationSec();
  const omega = (Math.PI * 2) / duration;
  state.spinAngle += omega * (dt || 1 / 60);

  if (n > 0) {
    tryPluckProng(activeProngIndex(state.spinAngle, n));
  }

  drawPreview();
  if (!state.animating) {
    updateStatus();
    return;
  }
  requestAnimationFrame(tickAnimation);
}

async function loadMidiFile(file) {
  const buf = await file.arrayBuffer();
  state.midi = new Midi(buf);
  state.fileName = file.name;
  state.source = SOURCE.MIDI;
  $("#songName").value = slug(file.name);
  updateTrackSelect(state.midi);
  $("#fileLabel").textContent = file.name;

  document.querySelectorAll(".source-tab").forEach((tab) => {
    const active = tab.dataset.source === SOURCE.MIDI;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  $("#panelHurrian").classList.add("is-hidden");
  $("#panelMidi").classList.remove("is-hidden");

  recompute();
}

function downloadJson() {
  const cfg = buildConfig(state.result, {
    songName: $("#songName").value || "hurrian-hymn",
    midi: state.source === SOURCE.MIDI ? state.fileName : null,
    dims: readControls().dims,
  });
  const blob = new Blob([JSON.stringify(cfg, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${slug(cfg.songName)}-comb-config.json`);
}

async function downloadStls() {
  const btn = $("#btnStl");
  const base = slug($("#songName").value || "hurrian-hymn");
  const lengths = state.result.lengths;

  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = "Generating…";

  try {
    const info = await downloadStlPair(lengths, base);
    if (info.zipBytes) {
      $("#statusLine").textContent =
        `Downloaded ${base}_MusicComb.zip — Comb (${(info.combBytes / 1024).toFixed(0)} KB) + Spinner (${(info.spinnerBytes / 1024).toFixed(0)} KB)`;
    } else {
      $("#statusLine").textContent =
        `Downloaded ${base}_Comb.stl and ${base}_Spinner.stl`;
    }
  } catch (err) {
    console.error(err);
    $("#statusLine").textContent = `Download failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

function init() {
  document.querySelectorAll(".source-tab").forEach((tab) => {
    tab.addEventListener("click", () => setSource(tab.dataset.source));
  });

  $("#midiFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) loadMidiFile(f);
  });

  const dropZone = $("#dropZone");
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    if (f && /\.midi?$/i.test(f.name)) loadMidiFile(f);
  });

  $("#numProngs").addEventListener("input", (e) => {
    $("#numProngsVal").textContent = e.target.value;
    recompute();
  });

  [
    "#trackSelect",
    "#useAllTracks",
    "#mapping",
    "#minLen",
    "#maxLen",
    "#minMidi",
    "#maxMidi",
    "#showSpinner",
  ].forEach((id) => {
    $(id).addEventListener("input", recompute);
    $(id).addEventListener("change", recompute);
  });

  $("#btnJson").addEventListener("click", downloadJson);
  $("#btnStl").addEventListener("click", downloadStls);

  $("#playAudio").addEventListener("change", (e) => {
    combAudio.muted = !e.target.checked;
  });
  combAudio.muted = !$("#playAudio").checked;

  $("#btnPlay").addEventListener("click", async () => {
    if (!state.animating) {
      try {
        await combAudio.start();
      } catch (err) {
        console.warn("Audio unavailable:", err);
      }
      state.animating = true;
      state.spinAngle = 0;
      state.lastPluckedIndex = -1;
      state.animLastTime = 0;
      $("#btnPlay").textContent = "Stop";
      if ($("#playAudio").checked) {
        tryPluckProng(0);
      }
      requestAnimationFrame(tickAnimation);
      return;
    }

    state.animating = false;
    state.lastPluckedIndex = -1;
    state.animLastTime = 0;
    $("#btnPlay").textContent = "Preview spin & play";
    updateStatus();
    drawPreview();
  });

  window.addEventListener("resize", drawPreview);

  loadHurrianDefault();
}

init();
