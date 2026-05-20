/**
 * Browser STL export (binary) — overlapping meshes for preview / draft prints.
 * For guaranteed single-solid STLs, use scripts/build_from_config.py
 */

const DIMS = {
  plateThickness: 1.2,
  hubRadius: 7,
  hubBearingH: 3,
  minFeature: 1.2,
  prongGap: 0.35,
  centerHoleR: 2.6,
  axlePinR: 2.2,
  axlePinLen: 3.6,
  ringClearance: 1.5,
  ringOuterExtra: 12,
  spinnerBoreR: 7.45,
  bridgeWidth: 2,
  numBridges: 3,
};

function prongAngle(i, n) {
  return (2 * Math.PI * i) / n;
}

function tipRadius(prongLen) {
  return DIMS.hubRadius + prongLen;
}

function ringInnerR(maxProngLen) {
  return DIMS.hubRadius + maxProngLen + DIMS.ringClearance;
}

function tangentialWidth(midR, n) {
  const sector = (2 * Math.PI) / n;
  return Math.max(sector * (1 - DIMS.prongGap) * midR, DIMS.minFeature);
}

/** @type {number[][]} */
function boxTriangles(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const v = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ].map(([x, y, z]) => [x + cx, y + cy, z + cz]);

  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [2, 3, 7],
    [2, 7, 6],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5],
  ];
  return faces.map((f) => [v[f[0]], v[f[1]], v[f[2]]]);
}

function cylinderTriangles(r, h, sections, z0 = 0) {
  const tris = [];
  for (let i = 0; i < sections; i++) {
    const a0 = (2 * Math.PI * i) / sections;
    const a1 = (2 * Math.PI * (i + 1)) / sections;
    const x0 = r * Math.cos(a0);
    const y0 = r * Math.sin(a0);
    const x1 = r * Math.cos(a1);
    const y1 = r * Math.sin(a1);
    tris.push(
      [[0, 0, z0], [x0, y0, z0], [x1, y1, z0]],
      [[x0, y0, z0 + h], [x1, y1, z0 + h], [x1, y1, z0]],
      [[x0, y0, z0 + h], [x1, y1, z0], [x0, y0, z0]],
      [[0, 0, z0 + h], [x1, y1, z0 + h], [x0, y0, z0 + h]]
    );
  }
  return tris;
}

function annulusTriangles(rMin, rMax, h, sections, z0 = 0) {
  const outer = cylinderTriangles(rMax, h, sections, z0).filter(
    (t) => t[0][0] !== 0 || t[0][1] !== 0
  );
  const inner = cylinderTriangles(rMin, h, sections, z0);
  const tris = [];
  for (let i = 0; i < sections; i++) {
    const a0 = (2 * Math.PI * i) / sections;
    const a1 = (2 * Math.PI * (i + 1)) / sections;
    const o0 = [rMax * Math.cos(a0), rMax * Math.sin(a0), z0];
    const o1 = [rMax * Math.cos(a1), rMax * Math.sin(a1), z0];
    const i0 = [rMin * Math.cos(a0), rMin * Math.sin(a0), z0];
    const i1 = [rMin * Math.cos(a1), rMin * Math.sin(a1), z0];
    const o0t = [o0[0], o0[1], z0 + h];
    const o1t = [o1[0], o1[1], z0 + h];
    const i0t = [i0[0], i0[1], z0 + h];
    const i1t = [i1[0], i1[1], z0 + h];
    tris.push([o0, o1, o1t], [o0, o1t, o0t], [i0, i1t, i1], [i0, i0t, i1t]);
    tris.push([o0, i0, i1], [o0, i1, o1], [o0t, o1t, i1t], [o0t, i1t, i0t]);
  }
  return tris;
}

function radialBoxTriangles(angle, midR, z, radialLen, tangW, thickness) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const ta = -sa;
  const tc = ca;
  const cx = midR * ca;
  const cy = midR * sa;
  const corners = [
    [-radialLen / 2, -tangW / 2, -thickness / 2],
    [radialLen / 2, -tangW / 2, -thickness / 2],
    [radialLen / 2, tangW / 2, -thickness / 2],
    [-radialLen / 2, tangW / 2, -thickness / 2],
    [-radialLen / 2, -tangW / 2, thickness / 2],
    [radialLen / 2, -tangW / 2, thickness / 2],
    [radialLen / 2, tangW / 2, thickness / 2],
    [-radialLen / 2, tangW / 2, thickness / 2],
  ].map(([rx, ry, rz]) => [
    cx + rx * ca + ry * ta,
    cy + rx * sa + ry * tc,
    z + rz,
  ]);
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [2, 3, 7],
    [2, 7, 6],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5],
  ];
  return faces.map((f) => [corners[f[0]], corners[f[1]], corners[f[2]]]);
}

/** Concatenate triangle lists. Never use `.flat()` — it splits each [v0,v1,v2] into three vertices. */
function mergeTriangles(list) {
  if (!list.length) return [];
  if (Array.isArray(list[0]?.[0]?.[0])) {
    return list.flat(1);
  }
  return list;
}

function toBinaryStl(triangles) {
  const count = triangles.length;
  const buf = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buf);
  const header = "MusicComb STL by hurrianhymn";
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }
  view.setUint32(80, count, true);
  let off = 84;
  for (const tri of triangles) {
    const [a, b, c] = tri;
    const ux = (b[0] - a[0]);
    const uy = (b[1] - a[1]);
    const uz = (b[2] - a[2]);
    const vx = (c[0] - a[0]);
    const vy = (c[1] - a[1]);
    const vz = (c[2] - a[2]);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    view.setFloat32(off, nx / len, true);
    view.setFloat32(off + 4, ny / len, true);
    view.setFloat32(off + 8, nz / len, true);
    off += 12;
    for (const p of tri) {
      view.setFloat32(off, p[0], true);
      view.setFloat32(off + 4, p[1], true);
      view.setFloat32(off + 8, p[2], true);
      off += 12;
    }
    view.setUint16(off, 0, true);
    off += 2;
  }
  return new Blob([buf], { type: "application/octet-stream" });
}

/** Minimum valid binary STL: 84-byte header + at least one triangle with real coordinates. */
export async function validateStlBlob(blob, label) {
  if (!blob || blob.size < 134) {
    throw new Error(`${label} STL is empty or invalid (${blob?.size ?? 0} bytes)`);
  }
  const buf = await blob.arrayBuffer();
  const view = new DataView(buf);
  const x = view.getFloat32(96, true);
  const y = view.getFloat32(100, true);
  const z = view.getFloat32(104, true);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error(`${label} STL has invalid geometry (NaN coordinates)`);
  }
}

export function buildCombStl(lengths) {
  const n = lengths.length;
  const tris = [];
  tris.push(
    ...cylinderTriangles(DIMS.hubRadius, DIMS.hubBearingH, 64, 0)
  );
  for (let i = 0; i < n; i++) {
    const len = lengths[i];
    const ang = prongAngle(i, n);
    const inner = DIMS.hubRadius - 0.5;
    const outer = tipRadius(len);
    const radialLen = outer - inner;
    const midR = inner + radialLen / 2;
    const tw = tangentialWidth(midR, n);
    tris.push(
      ...radialBoxTriangles(
        ang,
        midR,
        DIMS.plateThickness / 2,
        radialLen,
        tw,
        DIMS.plateThickness
      )
    );
  }
  return toBinaryStl(mergeTriangles(tris));
}

export function buildSpinnerStl(lengths) {
  const n = lengths.length;
  const maxLen = Math.max(...lengths);
  const rIn = ringInnerR(maxLen);
  const rOut = rIn + DIMS.ringOuterExtra;
  const ringZ = DIMS.hubBearingH + DIMS.plateThickness / 2;
  const tris = [];
  tris.push(...annulusTriangles(rIn, rOut, DIMS.plateThickness, 96, ringZ - DIMS.plateThickness / 2));
  tris.push(
    ...cylinderTriangles(DIMS.axlePinR, DIMS.axlePinLen, 32, 0)
  );
  tris.push(
    ...cylinderTriangles(
      DIMS.spinnerBoreR,
      DIMS.plateThickness,
      64,
      DIMS.hubBearingH - DIMS.plateThickness / 2
    )
  );
  for (let b = 0; b < DIMS.numBridges; b++) {
    const gapIndex = (b * n) / DIMS.numBridges + 0.5;
    const ang = (2 * Math.PI * gapIndex) / n;
    const innerR = DIMS.spinnerBoreR - 1.2;
    const outerR = rIn + 1.2;
    const radialLen = outerR - innerR;
    const midR = innerR + radialLen / 2;
    tris.push(
      ...radialBoxTriangles(
        ang,
        midR,
        DIMS.hubBearingH + 0.2,
        radialLen,
        DIMS.bridgeWidth,
        DIMS.plateThickness + 0.8
      )
    );
  }
  const rakeAng = 0;
  const zBot = DIMS.plateThickness - 0.05;
  const zTop = ringZ + DIMS.plateThickness / 2 + 0.6;
  const finH = zTop - zBot;
  const tips = lengths.map((L) => tipRadius(L));
  const spineInner = Math.min(...tips) - 1.5;
  const spineOuter = rIn + 1.2;
  tris.push(
    ...radialBoxTriangles(
      rakeAng,
      (spineInner + spineOuter) / 2,
      (zTop + zBot) / 2,
      spineOuter - spineInner,
      2.8,
      finH
    )
  );
  const tabZTop = DIMS.hubBearingH + 0.1;
  const tabH = tabZTop - zBot;
  for (let i = 0; i < n; i++) {
    const tipR = tipRadius(lengths[i]);
    const innerR = tipR - 1.35;
    const outerR = tipR + 0.35;
    const tw = tangentialWidth(tipR, n) * 0.72;
    tris.push(
      ...radialBoxTriangles(
        rakeAng,
        (innerR + outerR) / 2,
        (tabZTop + zBot) / 2,
        outerR - innerR,
        tw,
        tabH
      )
    );
  }
  return toBinaryStl(mergeTriangles(tris));
}

/**
 * Trigger a file download. Waits before revoking the object URL so the browser
 * can finish reading the blob (immediate revoke often breaks downloads).
 */
export function downloadBlob(blob, filename) {
  return new Promise((resolve, reject) => {
    if (!blob || blob.size === 0) {
      reject(new Error(`Cannot download empty file: ${filename}`));
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => {
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve();
      }, 500);
    });
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build comb + spinner STLs and download as one ZIP (most reliable in browsers).
 */
export async function downloadStlPairZip(lengths, baseName) {
  if (!lengths?.length) {
    throw new Error("No prong data — load Hurrian Hymn or a MIDI file first.");
  }

  const combBlob = buildCombStl(lengths);
  const spinnerBlob = buildSpinnerStl(lengths);
  await validateStlBlob(combBlob, "Comb");
  await validateStlBlob(spinnerBlob, "Spinner");

  const { default: JSZip } = await import(
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm"
  );
  const zip = new JSZip();
  zip.file(`${baseName}_Comb.stl`, await combBlob.arrayBuffer(), { binary: true });
  zip.file(`${baseName}_Spinner.stl`, await spinnerBlob.arrayBuffer(), {
    binary: true,
  });
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
  });

  await downloadBlob(zipBlob, `${baseName}_MusicComb.zip`);
  return {
    combBytes: combBlob.size,
    spinnerBytes: spinnerBlob.size,
    zipBytes: zipBlob.size,
  };
}

/**
 * Download two separate STL files (sequential, with delay between).
 */
export async function downloadStlPairSeparate(lengths, baseName) {
  if (!lengths?.length) {
    throw new Error("No prong data — load Hurrian Hymn or a MIDI file first.");
  }

  const combBlob = buildCombStl(lengths);
  const spinnerBlob = buildSpinnerStl(lengths);
  await validateStlBlob(combBlob, "Comb");
  await validateStlBlob(spinnerBlob, "Spinner");

  await downloadBlob(combBlob, `${baseName}_Comb.stl`);
  await delay(600);
  await downloadBlob(spinnerBlob, `${baseName}_Spinner.stl`);
  return { combBytes: combBlob.size, spinnerBytes: spinnerBlob.size };
}

/** Default: ZIP with both STLs; falls back to separate if ZIP fails. */
export async function downloadStlPair(lengths, baseName) {
  try {
    return await downloadStlPairZip(lengths, baseName);
  } catch (zipErr) {
    console.warn("ZIP download failed, trying separate STLs:", zipErr);
    return await downloadStlPairSeparate(lengths, baseName);
  }
}
