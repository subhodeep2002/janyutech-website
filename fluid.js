/*
 * FluidFlow — the site's image hover effect: the picture flows like liquid
 * around the pointer, curls into eddies, then settles back into place.
 *
 * One shared WebGL context runs a small incompressible fluid simulation for
 * each image the pointer is stirring: semi-Lagrangian advection, vorticity
 * confinement (the curls) and a Jacobi pressure solve (keeps the flow swirling
 * instead of spreading out). The velocity field carries a displacement map and
 * the image is redrawn through that map: no colour splitting, no lens zoom.
 * Each frame is copied into a 2D canvas laid exactly over the <img>. While an
 * image is calm the plain <img> shows and nothing runs.
 * Desktop pointers only; touch and reduced-motion visitors keep the plain images.
 */
(() => {
  window.FluidFlow = null;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduce) return;

  // tuned by eye: a visible liquid wake around the cursor that settles in about a second
  const CFG = {
    simRes: 128,        // velocity grid, short side
    dispRes: 256,       // displacement grid, short side
    curl: 9,            // vorticity confinement: how curly the flow gets
    velDecay: 2,        // velocity dissipation per second
    pressureDecay: 0.8,
    pressureIter: 8,
    grip: 0.85,         // how firmly the pointer drags the fluid (0–1)
    maxSpeed: 2400,     // px/s cap on pointer speed
    relax: 6,           // per second: how fast the picture flows back
    strength: 0.5,      // share of the fluid's displacement that shows
    maxDisp: 0.1,       // UV clamp on displacement
    settleMs: 2200,     // keep simulating this long after the last movement
    maxPixels: 1.2e6,   // render budget per image, in device pixels
  };

  /* ------------------------------------------------ shared WebGL context */
  const glCanvas = document.createElement("canvas");
  glCanvas.width = glCanvas.height = 16;
  const attrs = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
  let gl = glCanvas.getContext("webgl2", attrs);
  const gl2 = !!gl;
  if (!gl) gl = glCanvas.getContext("webgl", attrs);
  if (!gl) return;

  let HALF, linear;
  if (gl2) {
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("EXT_color_buffer_half_float");
    HALF = gl.HALF_FLOAT; linear = true;                  // 16-bit float textures filter natively in WebGL2
  } else {
    const hf = gl.getExtension("OES_texture_half_float");
    HALF = hf && hf.HALF_FLOAT_OES;
    linear = !!gl.getExtension("OES_texture_half_float_linear");
    gl.getExtension("EXT_color_buffer_half_float");
  }
  if (!HALF || !linear) return;

  function renderable(internal, format) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, HALF, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb); gl.deleteTexture(t);
    return ok;
  }
  const pick = (...cands) => cands.find(c => renderable(c[0], c[1])) || null;
  const FMT_RG = gl2 ? pick([gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]) : pick([gl.RGBA, gl.RGBA]);
  const FMT_R = gl2 ? pick([gl.R16F, gl.RED], [gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]) : FMT_RG;
  if (!FMT_RG || !FMT_R) return;

  /* ------------------------------------------------ shaders */
  const VS = `precision highp float;
    attribute vec2 aPos;
    uniform vec2 texel;
    varying vec2 vUv, vL, vR, vT, vB;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      vL = vUv - vec2(texel.x, 0.0); vR = vUv + vec2(texel.x, 0.0);
      vT = vUv + vec2(0.0, texel.y); vB = vUv - vec2(0.0, texel.y);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;
  const HEAD = `precision highp float; precision highp sampler2D; varying vec2 vUv, vL, vR, vT, vB;\n`;
  const FS = {
    // the pointer drags the fluid along the segment it walked this frame (a soft capsule brush)
    brush: HEAD + `uniform sampler2D uVel; uniform vec2 uA, uB, uForce; uniform float uAspect, uRadius, uGrip;
      void main() {
        vec2 p = vUv, a = uA, b = uB;
        p.x *= uAspect; a.x *= uAspect; b.x *= uAspect;
        vec2 ab = b - a;
        float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-7), 0.0, 1.0);
        vec2 d = p - (a + ab * t);
        float w = exp(-dot(d, d) / uRadius) * uGrip;
        gl_FragColor = vec4(mix(texture2D(uVel, vUv).xy, uForce, w), 0.0, 1.0);
      }`,
    curl: HEAD + `uniform sampler2D uVel;
      void main() {
        float L = texture2D(uVel, vL).y, R = texture2D(uVel, vR).y, T = texture2D(uVel, vT).x, B = texture2D(uVel, vB).x;
        gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
      }`,
    vorticity: HEAD + `uniform sampler2D uVel, uCurl; uniform float uCurlAmt, uDt;
      void main() {
        float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x, T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        f /= length(f) + 1e-4;
        f *= uCurlAmt * C; f.y *= -1.0;
        vec2 v = texture2D(uVel, vUv).xy + f * uDt;
        gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
      }`,
    divergence: HEAD + `uniform sampler2D uVel;
      void main() {
        float L = texture2D(uVel, vL).x, R = texture2D(uVel, vR).x, T = texture2D(uVel, vT).y, B = texture2D(uVel, vB).y;
        vec2 C = texture2D(uVel, vUv).xy;
        if (vL.x < 0.0) L = -C.x;
        if (vR.x > 1.0) R = -C.x;
        if (vT.y > 1.0) T = -C.y;
        if (vB.y < 0.0) B = -C.y;
        gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }`,
    scale: HEAD + `uniform sampler2D uTex; uniform float uValue;
      void main() { gl_FragColor = uValue * texture2D(uTex, vUv); }`,
    pressure: HEAD + `uniform sampler2D uP, uDiv;
      void main() {
        float L = texture2D(uP, vL).x, R = texture2D(uP, vR).x, T = texture2D(uP, vT).x, B = texture2D(uP, vB).x;
        gl_FragColor = vec4((L + R + T + B - texture2D(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
      }`,
    gradient: HEAD + `uniform sampler2D uP, uVel;
      void main() {
        float L = texture2D(uP, vL).x, R = texture2D(uP, vR).x, T = texture2D(uP, vT).x, B = texture2D(uP, vB).x;
        gl_FragColor = vec4(texture2D(uVel, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
      }`,
    advect: HEAD + `uniform sampler2D uVel, uSrc; uniform vec2 uVelTexel; uniform float uDt, uDecay;
      void main() {
        vec2 coord = vUv - uDt * texture2D(uVel, vUv).xy * uVelTexel;
        gl_FragColor = texture2D(uSrc, coord) / (1.0 + uDecay * uDt);
      }`,
    // displacement map: carried along by the flow, and eased back toward zero
    carry: HEAD + `uniform sampler2D uVel, uDisp; uniform vec2 uVelTexel; uniform float uDt, uKeep, uMax;
      void main() {
        vec2 step = uDt * texture2D(uVel, vUv).xy * uVelTexel;
        vec2 d = (texture2D(uDisp, vUv - step).xy - step) * uKeep;
        float m = length(d);
        if (m > uMax) d *= uMax / m;
        gl_FragColor = vec4(d, 0.0, 1.0);
      }`,
    // redraw the image through the displacement map
    display: HEAD + `uniform sampler2D uImg, uDisp; uniform vec2 uScale; uniform float uStrength, uContain;
      void main() {
        vec2 t = (vUv + texture2D(uDisp, vUv).xy * uStrength - 0.5) * uScale + 0.5;
        if (uContain > 0.5) {
          if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) { gl_FragColor = vec4(0.0); return; }
        } else {
          t = 1.0 - abs(1.0 - abs(t));                 // mirror at the edges
        }
        gl_FragColor = texture2D(uImg, t);
      }`,
  };

  function program(fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }
  let PR;
  try { PR = Object.fromEntries(Object.entries(FS).map(([k, src]) => [k, program(src)])); }
  catch (e) { console.warn("FluidFlow off:", e); return; }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  gl.disable(gl.BLEND);

  const use = (prog, tx = 0, ty = 0) => { gl.useProgram(prog.p); if (prog.u.texel) gl.uniform2f(prog.u.texel, tx, ty); return prog.u; };
  function blit(target, w, h) {
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ------------------------------------------------ render targets */
  function fbo(w, h, fmt, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, fmt[1], HALF, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      fbo: fb, w, h, tx: 1 / w, ty: 1 / h,
      attach(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; },
      free() { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); },
    };
  }
  function double(w, h, fmt, filter) {
    let a = fbo(w, h, fmt, filter), b = fbo(w, h, fmt, filter);
    return {
      w, h, tx: 1 / w, ty: 1 / h,
      get read() { return a; }, get write() { return b; },
      swap() { [a, b] = [b, a]; },
      free() { a.free(); b.free(); },
    };
  }

  /* ------------------------------------------------ image textures (small LRU) */
  const texCache = new Map();          // img -> texture
  function imageTexture(img) {
    if (texCache.has(img)) { const t = texCache.get(img); texCache.delete(img); texCache.set(img, t); return t; }
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); }
    catch (e) { gl.deleteTexture(tex); return null; }        // e.g. a cross-origin image
    finally { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (gl2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    texCache.set(img, tex);
    for (const [k, t] of texCache) {                        // keep at most six photos on the GPU
      if (texCache.size <= 6) break;
      if ([...active].some(f => f.img === k)) continue;
      gl.deleteTexture(t); texCache.delete(k);
    }
    return tex;
  }

  /* ------------------------------------------------ one stirred image */
  const active = new Set();
  class Flow {
    constructor(host, opts) {
      this.host = host;
      this.img = host.querySelector("img");
      this.o = Object.assign(Object.create(CFG), opts);   // per-image overrides, the rest follows CFG live
      this.ptr = null; this.last = null; this.moved = 0;
      host.addEventListener("pointermove", e => this.move(e), { passive: true });
      host.addEventListener("pointerleave", () => { this.ptr = null; this.last = null; });
    }
    move(e) {
      if (this.dead || document.hidden || performance.now() - scrolledAt < 160 || e.pointerType === "touch") return;
      const img = this.img;
      if (!img || !img.complete || !img.naturalWidth) return;
      const r = img.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.ptr = { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, t: e.timeStamp, w: r.width, h: r.height };
      this.moved = performance.now();
      if (!active.has(this)) start(this);
    }
  }

  function layout(f) {
    const img = f.img, bw = img.offsetWidth, bh = img.offsetHeight;
    if (!bw || !bh) return false;
    if (!f.cv) {
      if (getComputedStyle(f.host).position === "static") f.host.style.position = "relative";
      f.cv = document.createElement("canvas");
      f.cv.className = "fluid-canvas";
      f.cv.setAttribute("aria-hidden", "true");
      img.insertAdjacentElement("afterend", f.cv);
      f.ctx = f.cv.getContext("2d");
    }
    // mirror the <img> box exactly, including any transform it is animating with
    const cs = getComputedStyle(img), st = f.cv.style;
    st.left = img.offsetLeft + "px"; st.top = img.offsetTop + "px";
    st.width = bw + "px"; st.height = bh + "px";
    st.transform = cs.transform === "none" ? "" : cs.transform;
    st.transformOrigin = cs.transformOrigin;
    st.borderRadius = cs.borderRadius;

    let d = Math.min(devicePixelRatio || 1, 2);
    if (bw * bh * d * d > f.o.maxPixels) d = Math.sqrt(f.o.maxPixels / (bw * bh));
    const w = Math.max(1, Math.round(bw * d)), h = Math.max(1, Math.round(bh * d));
    if (f.cv.width !== w || f.cv.height !== h) { f.cv.width = w; f.cv.height = h; }
    f.rw = w; f.rh = h;

    const nw = img.naturalWidth, nh = img.naturalHeight, fit = cs.objectFit;
    if (fit === "cover" || fit === "contain") {
      const k = fit === "cover" ? Math.max(bw / nw, bh / nh) : Math.min(bw / nw, bh / nh);
      f.scale = [bw / (nw * k), bh / (nh * k)];
      f.contain = fit === "contain";
    } else { f.scale = [1, 1]; f.contain = false; }

    const aspect = bw / bh, key = aspect.toFixed(2);
    if (f.simKey !== key) { freeSim(f); allocSim(f, aspect); f.simKey = key; }
    f.brushPx = Math.max(18, Math.min(44, Math.min(bw, bh) * 0.045));   // a tight wake that stays near the pointer
    return true;
  }
  function allocSim(f, aspect) {
    const size = res => aspect >= 1 ? [Math.round(res * aspect), res] : [res, Math.round(res / aspect)];
    const [vw, vh] = size(f.o.simRes), [dw, dh] = size(f.o.dispRes);
    f.vel = double(vw, vh, FMT_RG, gl.LINEAR);
    f.p = double(vw, vh, FMT_R, gl.NEAREST);
    f.div = fbo(vw, vh, FMT_R, gl.NEAREST);
    f.curl = fbo(vw, vh, FMT_R, gl.NEAREST);
    f.disp = double(dw, dh, FMT_RG, gl.LINEAR);
  }
  function freeSim(f) {
    for (const k of ["vel", "p", "div", "curl", "disp"]) if (f[k]) { f[k].free(); f[k] = null; }
    f.simKey = null;
  }

  function start(f) {
    if (lost || !layout(f)) return;
    f.tex = imageTexture(f.img);
    if (!f.tex) { f.dead = true; freeSim(f); return; }
    f.last = null; f.shown = false;
    active.add(f);
    if (!frameId) { prev = performance.now(); frameId = requestAnimationFrame(frame); }
  }
  function stop(f) {
    active.delete(f);
    if (f.cv) f.cv.style.opacity = "0";
    f.img.style.opacity = "";
    f.shown = false; f.last = null;
    freeSim(f);
  }

  function step(f, dt) {
    const o = f.o, vel = f.vel;
    let u;

    // pointer: drag the fluid along the stretch it travelled since the last frame
    const b = f.ptr;
    if (b) {
      const a = f.last;
      if (a && b.t > a.t) {
        const secs = Math.max((b.t - a.t) / 1000, 1 / 240);
        let vx = (b.x - a.x) * b.w / secs, vy = (b.y - a.y) * b.h / secs;     // px/s
        const sp = Math.hypot(vx, vy);
        if (sp > o.maxSpeed) { vx *= o.maxSpeed / sp; vy *= o.maxSpeed / sp; }
        if (sp > 2) {
          const toTexels = vel.h / b.h, rad = f.brushPx / b.h;
          u = use(PR.brush, vel.tx, vel.ty);
          gl.uniform1i(u.uVel, vel.read.attach(0));
          gl.uniform2f(u.uA, a.x, a.y);
          gl.uniform2f(u.uB, b.x, b.y);
          gl.uniform2f(u.uForce, vx * toTexels, vy * toTexels);
          gl.uniform1f(u.uAspect, b.w / b.h);
          gl.uniform1f(u.uRadius, rad * rad);
          gl.uniform1f(u.uGrip, o.grip);
          blit(vel.write); vel.swap();
        }
      }
      if (!a || b.t > a.t) f.last = { x: b.x, y: b.y, t: b.t };
    }

    u = use(PR.curl, vel.tx, vel.ty);
    gl.uniform1i(u.uVel, vel.read.attach(0));
    blit(f.curl);

    u = use(PR.vorticity, vel.tx, vel.ty);
    gl.uniform1i(u.uVel, vel.read.attach(0));
    gl.uniform1i(u.uCurl, f.curl.attach(1));
    gl.uniform1f(u.uCurlAmt, o.curl);
    gl.uniform1f(u.uDt, dt);
    blit(vel.write); vel.swap();

    u = use(PR.divergence, vel.tx, vel.ty);
    gl.uniform1i(u.uVel, vel.read.attach(0));
    blit(f.div);

    u = use(PR.scale, vel.tx, vel.ty);
    gl.uniform1i(u.uTex, f.p.read.attach(0));
    gl.uniform1f(u.uValue, o.pressureDecay);
    blit(f.p.write); f.p.swap();

    u = use(PR.pressure, vel.tx, vel.ty);
    gl.uniform1i(u.uDiv, f.div.attach(0));
    for (let i = 0; i < o.pressureIter; i++) {
      gl.uniform1i(u.uP, f.p.read.attach(1));
      blit(f.p.write); f.p.swap();
    }

    u = use(PR.gradient, vel.tx, vel.ty);
    gl.uniform1i(u.uP, f.p.read.attach(0));
    gl.uniform1i(u.uVel, vel.read.attach(1));
    blit(vel.write); vel.swap();

    u = use(PR.advect, vel.tx, vel.ty);
    gl.uniform2f(u.uVelTexel, vel.tx, vel.ty);
    gl.uniform1i(u.uVel, vel.read.attach(0));
    gl.uniform1i(u.uSrc, vel.read.attach(0));
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uDecay, o.velDecay);
    blit(vel.write); vel.swap();

    u = use(PR.carry, f.disp.tx, f.disp.ty);
    gl.uniform2f(u.uVelTexel, vel.tx, vel.ty);
    gl.uniform1i(u.uVel, vel.read.attach(0));
    gl.uniform1i(u.uDisp, f.disp.read.attach(1));
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uKeep, Math.exp(-o.relax * dt));
    gl.uniform1f(u.uMax, o.maxDisp);
    blit(f.disp.write); f.disp.swap();
  }

  function render(f) {
    const w = f.rw, h = f.rh;
    if (glCanvas.width < w || glCanvas.height < h) {
      glCanvas.width = Math.max(glCanvas.width, w);
      glCanvas.height = Math.max(glCanvas.height, h);
    }
    const u = use(PR.display);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, f.tex);
    gl.uniform1i(u.uImg, 0);
    gl.uniform1i(u.uDisp, f.disp.read.attach(1));
    gl.uniform2f(u.uScale, f.scale[0], f.scale[1]);
    gl.uniform1f(u.uStrength, f.o.strength);
    gl.uniform1f(u.uContain, f.contain ? 1 : 0);
    blit(null, w, h);
    // the frame sits in the bottom-left corner of the shared drawing buffer
    f.ctx.clearRect(0, 0, w, h);
    f.ctx.drawImage(glCanvas, 0, glCanvas.height - h, w, h, 0, 0, w, h);
    if (!f.shown) { f.shown = true; f.cv.style.opacity = "1"; f.img.style.opacity = "0"; }
  }

  let lost = false;
  glCanvas.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; [...active].forEach(stop); });

  let prev = performance.now(), frameId = 0, scrolledAt = -Infinity;
  function frame(now) {
    frameId = 0;
    const dt = Math.min(Math.max((now - prev) / 1000, 1 / 240), 1 / 30);
    prev = now;
    if (!active.size || lost || document.hidden) return;
    for (const f of [...active]) {
      const r = f.img.getBoundingClientRect();
      const offscreen = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
      if (offscreen || now - f.moved > f.o.settleMs || !layout(f)) { stop(f); continue; }
      step(f, dt);
      render(f);
    }
    if (active.size) frameId = requestAnimationFrame(frame);
  }
  const stopAll = () => {
    cancelAnimationFrame(frameId); frameId = 0;
    for (const f of [...active]) stop(f);
  };
  addEventListener("scroll", () => { scrolledAt = performance.now(); stopAll(); }, { passive: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopAll(); });

  const flows = new WeakMap();
  window.FluidFlow = {
    cfg: CFG,
    attach(host, opts = {}) {
      if (!host || flows.has(host) || !host.querySelector("img")) return;
      flows.set(host, new Flow(host, opts));
    },
  };
})();
