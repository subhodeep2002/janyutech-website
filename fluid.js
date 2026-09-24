/*
 * FluidLens — mouse-driven liquid smear with a gentle "black hole" pull.
 * Each instance owns a WebGL canvas laid over its host element:
 *   1. a small flow map (ping-pong) records mouse velocity, advects and fades it,
 *   2. the display pass offsets the source texture by that flow, swirls it,
 *      pinches it toward the cursor (gravitational lensing) and splits RGB.
 * Desktop pointers only; touch and reduced-motion users keep the plain DOM.
 */
(() => {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduce) { window.FluidLens = null; return; }

  const VERT = `attribute vec2 p; varying vec2 vUv;
    void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

  const FLOW = `precision highp float; varying vec2 vUv;
    uniform sampler2D tPrev; uniform vec2 uMouse, uVel; uniform float uAspect, uRadius, uDiss;
    vec2 dec(vec4 c){ return c.xy * 2.0 - 1.0; }
    void main(){
      vec2 v0 = dec(texture2D(tPrev, vUv));
      vec2 v = dec(texture2D(tPrev, vUv - v0 * 0.015)) * uDiss;          // advect = smear trail
      if (length(v) < 0.02) v = vec2(0.0);                                // kill 8-bit drift
      vec2 c = vUv - uMouse; c.x *= uAspect;
      float f = smoothstep(uRadius, 0.0, length(c)) * clamp(length(uVel) * 1.5, 0.0, 1.0);
      v = mix(v, clamp(uVel, -1.0, 1.0), f);
      gl_FragColor = vec4(v * 0.5 + 0.5, 0.0, 1.0);
    }`;

  const DISPLAY = `precision highp float; varying vec2 vUv;
    uniform sampler2D tMap, tFlow; uniform vec2 uCover, uMouse;
    uniform float uAspect, uStrength, uLens, uRGB, uSwirl, uClear;
    vec2 cover(vec2 uv){ return (uv - 0.5) * uCover + 0.5; }
    void main(){
      vec2 flow = texture2D(tFlow, vUv).xy * 2.0 - 1.0;
      if (length(flow) < 0.02) flow = vec2(0.0);
      float m = length(flow);
      float a = m * uSwirl;                                              // swirl like an accretion disk
      flow = mat2(cos(a), -sin(a), sin(a), cos(a)) * flow;

      vec2 d = vUv - uMouse; d.x *= uAspect;
      float r = length(d);
      vec2 dir = r > 1e-4 ? d / r : vec2(0.0); dir.x /= uAspect;
      float lens = uLens * 0.045 * smoothstep(0.32, 0.0, r) * smoothstep(0.0, 0.08, r);  // pinch toward cursor

      vec2 base = vUv - flow * uStrength + dir * lens;
      vec2 off = (flow * uStrength * 0.35 + dir * lens * 0.5) * uRGB;
      vec4 tr = texture2D(tMap, cover(base + off));
      vec4 tg = texture2D(tMap, cover(base));
      vec4 tb = texture2D(tMap, cover(base - off));
      // composite each channel over white, then (for transparent hosts) un-composite so it sits on anything
      vec3 w = vec3(mix(1.0, tr.r, tr.a), mix(1.0, tg.g, tg.a), mix(1.0, tb.b, tb.a));
      if (uClear > 0.5) {
        float a = 1.0 - min(w.r, min(w.g, w.b));
        gl_FragColor = vec4(w - (1.0 - a), a);
      } else {
        gl_FragColor = vec4(w, 1.0);
      }
    }`;

  const FLOW_SIZE = 128;
  const instances = [];
  const mouse = { x: -9999, y: -9999 };
  addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([t, src]) => {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    });
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }

  function texture(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  class FluidLens {
    /**
     * host   element the canvas covers (gets class "is-gl" once live)
     * source HTMLImageElement or HTMLCanvasElement
     * opts   strength, rgb, lens, swirl, radius, diss, update(ctx) → bool (for canvas sources)
     */
    constructor(host, source, opts = {}) {
      this.host = host;
      this.source = source;
      this.o = Object.assign({ strength: 0.06, rgb: 1, lens: 1, swirl: 1.6, radius: 0.22, diss: 0.955, update: null }, opts);
      const c = this.canvas = document.createElement("canvas");
      c.className = "fluid-canvas";
      const gl = this.gl = c.getContext("webgl", this.o.transparent ? { alpha: true, antialias: false, premultipliedAlpha: true } : { alpha: false, antialias: false, premultipliedAlpha: false });
      if (!gl) throw new Error("no webgl");
      host.appendChild(c);

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      this.flowProg = compile(gl, VERT, FLOW);
      this.dispProg = compile(gl, VERT, DISPLAY);

      this.flow = [0, 1].map(() => {
        const tex = texture(gl);
        const neutral = new Uint8Array(FLOW_SIZE * FLOW_SIZE * 4).fill(128);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FLOW_SIZE, FLOW_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, neutral);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fb };
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      this.map = texture(gl);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      this.uploaded = false;

      this.uv = null; this.vel = { x: 0, y: 0 }; this.lensAmt = 0;
      this.visible = false;
      new IntersectionObserver(([e]) => (this.visible = e.isIntersecting)).observe(host);
      this.resize();
      instances.push(this);
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.w = this.host.offsetWidth; this.h = this.host.offsetHeight;
      this.canvas.width = Math.max(1, Math.round(this.w * dpr));
      this.canvas.height = Math.max(1, Math.round(this.h * dpr));
      this.dpr = dpr;
      if (this.o.onResize) this.o.onResize(this);
      this.uploaded = false;
    }

    upload() {
      const gl = this.gl, s = this.source;
      const ready = s instanceof HTMLImageElement ? s.complete && s.naturalWidth : true;
      if (!ready) return false;
      gl.bindTexture(gl.TEXTURE_2D, this.map);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s);
      } catch (e) {            // e.g. a cross-origin image: give up quietly, keep the plain <img>
        this.dead = true; this.canvas.remove(); this.host.classList.remove("is-gl");
        return false;
      }
      const sw = s.naturalWidth || s.width, sh = s.naturalHeight || s.height;
      const ea = this.w / this.h, ia = sw / sh;
      this.cover = ea > ia ? [1, ia / ea] : [ea / ia, 1];
      if (!this.uploaded) this.host.classList.add("is-gl");
      this.uploaded = true;
      return true;
    }

    frame() {
      if (!this.visible || this.dead) return;
      const gl = this.gl;
      if (this.o.update && this.o.update(this)) this.uploaded = false;
      if (!this.uploaded && !this.upload()) return;

      // mouse in local UV (y up)
      const r = this.host.getBoundingClientRect();
      const nx = (mouse.x - r.left) / r.width, ny = 1 - (mouse.y - r.top) / r.height;
      const inside = nx > -0.1 && nx < 1.1 && ny > -0.1 && ny < 1.1;
      let tvx = 0, tvy = 0;
      if (this.uv && inside) { tvx = (nx - this.uv.x) * 12; tvy = (ny - this.uv.y) * 12; }
      this.uv = { x: nx, y: ny };
      this.vel.x += (tvx - this.vel.x) * 0.25;
      this.vel.y += (tvy - this.vel.y) * 0.25;
      this.lensAmt += ((inside && nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 ? 1 : 0) - this.lensAmt) * 0.08;
      const aspect = r.width / r.height;

      // flow pass
      const [a, b] = this.flow;
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.viewport(0, 0, FLOW_SIZE, FLOW_SIZE);
      gl.useProgram(this.flowProg.p);
      const fu = this.flowProg.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(fu.tPrev, 0);
      gl.uniform2f(fu.uMouse, nx, ny);
      gl.uniform2f(fu.uVel, this.vel.x, this.vel.y);
      gl.uniform1f(fu.uAspect, aspect);
      gl.uniform1f(fu.uRadius, this.o.radius);
      gl.uniform1f(fu.uDiss, this.o.diss);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.flow = [b, a];

      // display pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.dispProg.p);
      const du = this.dispProg.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.map);
      gl.uniform1i(du.tMap, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.uniform1i(du.tFlow, 1);
      gl.uniform2f(du.uCover, this.cover[0], this.cover[1]);
      gl.uniform2f(du.uMouse, nx, ny);
      gl.uniform1f(du.uAspect, aspect);
      gl.uniform1f(du.uStrength, this.o.strength);
      gl.uniform1f(du.uLens, this.o.lens * this.lensAmt);
      gl.uniform1f(du.uRGB, this.o.rgb);
      gl.uniform1f(du.uSwirl, this.o.swirl);
      gl.uniform1f(du.uClear, this.o.transparent ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => instances.forEach(i => i.resize()), 150); });
  (function loop() { instances.forEach(i => i.frame()); requestAnimationFrame(loop); })();

  window.FluidLens = FluidLens;
})();
