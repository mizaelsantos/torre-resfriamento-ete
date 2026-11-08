// Versão para GitHub Pages: substitui o servidor Python por código no próprio navegador.
// - "Arduino via USB": Web Serial (Chrome ou Edge no computador), 115200 8N1, mesmo firmware v2.
// - "Simulador": a mesma lógica do firmware, para celular ou qualquer navegador.
// Intercepta fetch("/api/...") e EventSource("/api/stream"), então app.js funciona sem mudanças.
(function () {
  "use strict";
  const TEMP_LIGA = 20, TEMP_DESLIGA = 18, TEMP_MAXIMA = 35, TEMP_SAI_MAXIMA = 33, WATCHDOG_S = 5;
  const SIM = "SIMULADOR", USB = "WEBSERIAL";
  const map = (x, a, b, c, d) => Math.trunc(((x - a) * (d - c)) / (b - a) + c);
  const now = () => Date.now() / 1000;

  // ---------------------------------------------------------------- eventos para a página
  const sinks = new Set();
  function publish(kind, data) { sinks.forEach((es) => es._emit(kind, data)); }
  function log(text, level = "info") { publish("log", { t: now(), text, level }); }

  class LocalEventSource {
    constructor() { this._h = {}; this.onerror = null; this.readyState = 1; sinks.add(this); setTimeout(() => publish("status", LINK.status()), 0); }
    addEventListener(k, fn) { (this._h[k] = this._h[k] || []).push(fn); }
    removeEventListener(k, fn) { this._h[k] = (this._h[k] || []).filter((f) => f !== fn); }
    close() { sinks.delete(this); this.readyState = 2; }
    _emit(kind, data) { (this._h[kind] || []).forEach((fn) => fn({ data: JSON.stringify(data) })); }
  }

  // ---------------------------------------------------------------- simulador (igual ao firmware)
  class SimArduino {
    constructor() { this.pot = 22; this.potManual = false; this.estado = 0; this.modo = 0; this.tempRemota = 25; this.manualPct = 0; this.lastCmd = now(); this.t0 = now(); }
    command(line) {
      this.lastCmd = now();
      const c = line.slice(0, 1).toUpperCase(), v = parseFloat(line.slice(1) || "0");
      if (c === "L") this.modo = 0;
      else if (c === "R") { this.tempRemota = Math.max(0, Math.min(100, v)); this.modo = 1; }
      else if (c === "M") { this.manualPct = Math.max(0, Math.min(100, Math.trunc(v))); this.modo = 2; }
    }
    step() {
      const t = now();
      if (this.modo !== 0 && t - this.lastCmd > WATCHDOG_S) this.modo = 0;
      if (!this.potManual) this.pot = 24 + 13 * Math.sin((t - this.t0) / 22) + (Math.random() - 0.5) * 0.2;
      const pot = Math.round(Math.max(0, Math.min(100, this.pot)) * 10) / 10;
      const temp = this.modo === 1 ? Math.round(this.tempRemota * 10) / 10 : pot;
      let e = this.estado;
      if (e === 0 && temp >= TEMP_LIGA) e = 1;
      else if (e === 1 && temp < TEMP_DESLIGA) e = 0;
      else if (e === 1 && temp >= TEMP_MAXIMA) e = 2;
      else if (e === 2 && temp <= TEMP_SAI_MAXIMA) e = 1;
      this.estado = e;
      let pwm;
      if (this.modo === 2) { pwm = map(this.manualPct, 0, 100, 0, 255); e = pwm === 0 ? 0 : pwm >= 255 ? 2 : 1; }
      else if (e === 0) pwm = 0;
      else if (e === 1) pwm = Math.max(178, Math.min(255, map(Math.trunc(temp * 10), 200, 350, 178, 255)));
      else pwm = 255;
      return `$D,${temp.toFixed(1)},${map(pwm, 0, 255, 0, 100)},${pwm},${map(pwm, 0, 255, 0, 3000)},${e},${this.modo},${pot.toFixed(1)}`;
    }
  }

  // ---------------------------------------------------------------- ligação (USB ou simulador)
  const LINK = {
    port: null, connected: false, error: "", desired: "L", framesOk: 0, framesBad: 0, sim: null,
    _timers: [], _serial: null, _writer: null, _reader: null,
    status() {
      return { connected: this.connected, port: this.port, simulated: this.port === SIM, error: this.error,
        desired: this.desired, framesOk: this.framesOk, framesBad: this.framesBad, pyserial: true };
    },
    handleLine(line) {
      line = line.trim();
      if (!line) return;
      if (line.startsWith("$I")) { log(`Arduino identificado: ${line}`, "ok"); return; }
      if (!line.startsWith("$D,")) return;
      const p = line.slice(3).split(",");
      const temp = parseFloat(p[0]), pot = parseFloat(p[6]);
      const [pct, pwm, rpm, est, modo] = p.slice(1, 6).map((x) => parseInt(x, 10));
      if (p.length !== 7 || [temp, pot, pct, pwm, rpm, est, modo].some(Number.isNaN) || temp < 0 || temp > 100 || pwm < 0 || pwm > 255) { this.framesBad++; return; }
      this.framesOk++;
      publish("tel", { t: now(), temp, pct, pwm, rpm, estado: est, modo, pot, sim: this.port === SIM });
    },
    async connect(port) {
      await this.disconnect();
      this.port = port; this.error = ""; this.framesOk = this.framesBad = 0; this.desired = "L";
      this._timers.push(setInterval(() => this.connected && publish("status", this.status()), 2000));
      if (port === SIM) {
        this.sim = new SimArduino(); this.connected = true;
        log("Modo SIMULADOR ativo (dados sintéticos, sem Arduino).", "warn");
        log("$I,TORRE3D,2 (simulado)");
        publish("status", this.status());
        this._timers.push(setInterval(() => this.handleLine(this.sim.step()), 250));
        this._timers.push(setInterval(() => this.sim && this.sim.command(this.desired), 1000));
        return;
      }
      if (!("serial" in navigator)) throw new Error("Este navegador não tem Web Serial. Use Chrome ou Edge no computador, ou o Simulador.");
      const sp = await navigator.serial.requestPort();
      await sp.open({ baudRate: 115200, dataBits: 8, parity: "none", stopBits: 1 });
      this._serial = sp; this.connected = true;
      log("Porta USB aberta. Aguardando o Arduino reiniciar...", "ok");
      publish("status", this.status());
      const enc = new TextEncoder();
      this._writer = sp.writable.getWriter();
      this._send = (cmd) => this._writer && this._writer.write(enc.encode(cmd + "\n")).catch(() => {});
      setTimeout(() => this._timers.push(setInterval(() => this._send(this.desired), 1000)), 1800);
      this._readLoop(sp);
    },
    async _readLoop(sp) {
      const dec = new TextDecoder();
      let buf = "";
      try {
        this._reader = sp.readable.getReader();
        for (;;) {
          const { value, done } = await this._reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) { this.handleLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
          if (buf.length > 512) buf = "";
        }
      } catch (e) {
        this.error = String(e.message || e);
        log(`Falha na porta USB: ${this.error}`, "error");
      } finally {
        if (this.connected && this.port === USB) await this.disconnect();
      }
    },
    send(cmd) {
      if ("LRM".includes(cmd[0].toUpperCase())) this.desired = cmd;
      if (this.port === SIM) this.sim && this.sim.command(cmd); else this._send && this._send(cmd);
      publish("status", this.status());
    },
    async disconnect() {
      this._timers.forEach(clearInterval); this._timers = [];
      const was = this.connected;
      if (this._serial) {
        try { this._send && (await this._send("L")); } catch (e) { /* ignora */ }
        try { this._reader && (await this._reader.cancel()); } catch (e) { /* ignora */ }
        try { this._reader && this._reader.releaseLock(); } catch (e) { /* ignora */ }
        try { this._writer && this._writer.releaseLock(); } catch (e) { /* ignora */ }
        try { await this._serial.close(); } catch (e) { /* ignora */ }
      }
      this._serial = this._writer = this._reader = this._send = null; this.sim = null;
      this.connected = false;
      if (was) { log("Desconectado.", "warn"); publish("status", this.status()); }
    },
  };

  // ---------------------------------------------------------------- rotas /api
  const json = (data, code = 200) => new Response(JSON.stringify(data), { status: code, headers: { "Content-Type": "application/json" } });
  async function route(path, body) {
    if (path.endsWith("/api/ports")) {
      const ports = [];
      if ("serial" in navigator) ports.push({ device: USB, label: "Arduino via USB (Web Serial)" });
      ports.push({ device: SIM, label: "Simulador (sem placa)" });
      return json({ ports });
    }
    if (path.endsWith("/api/status")) return json(LINK.status());
    if (path.endsWith("/api/connect")) {
      try { await LINK.connect(String(body.port || "")); return json({ ok: true }); }
      catch (e) { const m = e.name === "NotFoundError" ? "Nenhuma porta escolhida." : String(e.message || e); LINK.error = m; return json({ ok: false, error: m }, 400); }
    }
    if (path.endsWith("/api/disconnect")) { await LINK.disconnect(); return json({ ok: true }); }
    if (path.endsWith("/api/command")) {
      const mode = String(body.mode || "").toUpperCase();
      let cmd;
      if (mode === "LOCAL") cmd = "L";
      else if (mode === "REMOTO") cmd = `R${Number(body.value).toFixed(1)}`;
      else if (mode === "MANUAL") cmd = `M${Math.round(Number(body.value))}`;
      else return json({ ok: false, error: "Comando inválido" }, 400);
      if (!LINK.connected) return json({ ok: false, error: "Não conectado" }, 409);
      LINK.send(cmd);
      return json({ ok: true, sent: cmd });
    }
    if (path.endsWith("/api/simpot")) {
      if (LINK.sim) { LINK.sim.pot = Math.max(0, Math.min(100, Number(body.value))); LINK.sim.potManual = !!body.manual; }
      return json({ ok: true });
    }
    return json({ ok: false, error: "Rota desconhecida" }, 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, opt) {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/") || url.includes("/api/")) {
      let body = {};
      try { body = opt && opt.body ? JSON.parse(opt.body) : {}; } catch (e) { body = {}; }
      return route(url, body);
    }
    return realFetch(input, opt);
  };
  const RealES = window.EventSource;
  window.EventSource = function (url, cfg) { return String(url).includes("/api/stream") ? new LocalEventSource() : new RealES(url, cfg); };
  window.addEventListener("beforeunload", () => { LINK.disconnect(); });
})();
