import { useState, useRef, useCallback, useEffect } from "react";

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@300;400;600;800&display=swap";
document.head.appendChild(fontLink);

const globalStyles = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#020408;font-family:'Exo 2',sans-serif;color:#c8d8e8;overflow-x:hidden}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:#020408}
::-webkit-scrollbar-thumb{background:#0ff4;border-radius:4px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes gridScroll{0%{background-position:0 0}100%{background-position:0 40px}}
@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes borderGlow{0%,100%{box-shadow:0 0 8px #0ff3}50%{box-shadow:0 0 20px #0ff8,0 0 40px #0ff3}}
@keyframes radarSpin{to{transform:rotate(360deg)}}
@keyframes slideIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
`;
const styleEl = document.createElement("style");
styleEl.textContent = globalStyles;
document.head.appendChild(styleEl);

const API_URL = "http://localhost:8000/detect";

const SCAN_STEPS = [
  "Initializing forensic engine…",
  "Running Error Level Analysis (ELA)…",
  "Extracting DCT coefficient anomalies…",
  "Analyzing PRNU sensor fingerprints…",
  "Running semantic consistency check…",
  "Performing noise pattern analysis…",
  "Computing manipulation probability map…",
  "Finalizing forensic report…",
];

function verdictStyle(verdict) {
  if (verdict === "AUTHENTIC") return { color: "#00ff9d", accent: "0,255,157" };
  if (verdict === "SUSPICIOUS") return { color: "#ffb800", accent: "255,184,0" };
  return { color: "#ff2d55", accent: "255,45,85" };
}

function drawHeatmap(canvas, img, intensity) {
  const ctx = canvas.getContext("2d");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const edge = Math.abs(gray - 128) / 128;
    const heat = Math.pow(edge, 1.5) * intensity;
    const noise = Math.random() * 0.15 * intensity;
    const v = Math.min(1, heat + noise);
    d[i]   = Math.min(255, d[i] * 0.2 + v * 255);
    d[i+1] = Math.min(255, d[i+1] * 0.1 + v * 160 * (1 - v));
    d[i+2] = Math.min(255, d[i+2] * 0.05 + v * 20);
    d[i+3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function AnimatedBar({ value, color, delay = 0 }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value * 100), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return (
    <div style={{ height: 6, background: "#ffffff0d", borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${width}%`, background: color, borderRadius: 4,
        transition: "width 1.2s cubic-bezier(.16,1,.3,1)",
        boxShadow: `0 0 10px ${color}88`,
      }} />
    </div>
  );
}

function MetricCard({ label, value, color, delay }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = null;
    const target = Math.round(value * 100);
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / 1200, 1);
      setDisplay(Math.round(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const t = setTimeout(() => requestAnimationFrame(step), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return (
    <div style={{
      background: "#ffffff04", border: `1px solid ${color}33`, borderRadius: 12,
      padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: `inset 0 0 20px ${color}08`,
      animation: "fadeIn .5s ease both", animationDelay: `${delay}ms`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: "#6a8a9a", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: "'Rajdhani'", fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{display}<span style={{ fontSize: 14 }}>%</span></span>
      </div>
      <AnimatedBar value={value} color={color} delay={delay + 200} />
    </div>
  );
}

function SignalRow({ label, value, color, delay }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, animation: "slideIn .4s ease both", animationDelay: `${delay}ms` }}>
      <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: "#4a6a7a", width: 60, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: "#ffffff08", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 4, transition: "width 1.4s cubic-bezier(.16,1,.3,1)",
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
      <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color, width: 34, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function CompareSlider({ original, heatmapCanvas }) {
  const [pos, setPos] = useState(50);
  const sliderRef = useRef();
  const dragging = useRef(false);
  const heatmapUrl = useRef("");
  useEffect(() => { if (heatmapCanvas) heatmapUrl.current = heatmapCanvas.toDataURL(); }, [heatmapCanvas]);
  const move = useCallback((e) => {
    if (!dragging.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    setPos(Math.max(2, Math.min(98, (x / rect.width) * 100)));
  }, []);
  return (
    <div ref={sliderRef} onMouseMove={move} onTouchMove={move}
      onMouseUp={() => { dragging.current = false; }} onTouchEnd={() => { dragging.current = false; }}
      style={{ position: "relative", width: "100%", userSelect: "none", cursor: "col-resize", borderRadius: 10, overflow: "hidden" }}>
      <img src={original} alt="original" style={{ width: "100%", display: "block", maxHeight: 340, objectFit: "contain", background: "#000" }} />
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={heatmapUrl.current} alt="heatmap" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
      <div onMouseDown={() => { dragging.current = true; }} onTouchStart={() => { dragging.current = true; }}
        style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`, width: 2, background: "#0ff", cursor: "col-resize", transform: "translateX(-50%)", zIndex: 10 }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 28, height: 28, borderRadius: "50%", background: "#020408", border: "2px solid #0ff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px #0ff8" }}>
          <span style={{ color: "#0ff", fontSize: 10, fontFamily: "monospace" }}>⇔</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 8, left: 10, fontFamily: "'Share Tech Mono'", fontSize: 10, color: "#0ff", background: "#020408cc", padding: "2px 8px", borderRadius: 4 }}>ORIGINAL</div>
      <div style={{ position: "absolute", top: 8, right: 10, fontFamily: "'Share Tech Mono'", fontSize: 10, color: "#ff2d55", background: "#020408cc", padding: "2px 8px", borderRadius: 4 }}>HEATMAP</div>
    </div>
  );
}

export default function ForensicDetector() {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [heatmapCanvas, setHeatmapCanvas] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
  const [scanPos, setScanPos] = useState(0);
  const imgRef = useRef();
  const canvasRef = useRef();
  const inputRef = useRef();
  const scanAnimRef = useRef();

  const handleFile = useCallback((f) => {
    if (!f?.type.startsWith("image/")) return;
    setFile(f); setResult(null); setApiError(null);
    setHeatmapCanvas(null); setShowCompare(false); setStepIdx(-1);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }, []);

  const runScan = useCallback(async () => {
    if (!file) return;
    setScanning(true); setResult(null); setApiError(null);
    setHeatmapCanvas(null); setShowCompare(false);

    // animate scan beam
    let sp = 0;
    const beamAnim = () => { sp = (sp + 1.2) % 101; setScanPos(sp); scanAnimRef.current = requestAnimationFrame(beamAnim); };
    scanAnimRef.current = requestAnimationFrame(beamAnim);

    // run forensic step UI while API call is in flight
    const stepInterval = setInterval(() => {
      setStepIdx(i => (i < SCAN_STEPS.length - 1 ? i + 1 : i));
    }, 500);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(API_URL, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const data = await res.json();

      // Ensure all steps finish before showing result
      await new Promise(r => setTimeout(r, 400));

      // Map snake_case API response to camelCase result object
      setResult({
        verdict:      data.verdict,
        filename:     data.filename,
        aiGenerated:  data.ai_generated,
        tampering:    data.tampering,
        authenticity: data.authenticity,
        deepfakeRisk: data.deepfake_risk,
        signals: {
          ela:      data.ela,
          dct:      data.dct,
          prnu:     data.prnu,
          semantic: data.semantic,
          noise:    data.noise,
        },
      });
    } catch (err) {
      setApiError(err.message || "Could not reach the backend.");
    } finally {
      clearInterval(stepInterval);
      cancelAnimationFrame(scanAnimRef.current);
      setScanPos(0);
      setScanning(false);
    }
  }, [file]);

  // Render heatmap once result arrives
  useEffect(() => {
    if (result && imgRef.current && canvasRef.current) {
      setTimeout(() => {
        drawHeatmap(canvasRef.current, imgRef.current, result.tampering * 1.4 + 0.3);
        setHeatmapCanvas(canvasRef.current);
      }, 300);
    }
  }, [result]);

  const reset = () => {
    setPreview(null); setFile(null); setResult(null); setApiError(null);
    setHeatmapCanvas(null); setShowCompare(false); setStepIdx(-1); setScanning(false);
    cancelAnimationFrame(scanAnimRef.current);
    if (inputRef.current) inputRef.current.value = "";
  };

  const { color: verdictColor = "#0ff", accent: verdictAccent = "0,255,255" } = result ? verdictStyle(result.verdict) : {};

  return (
    <div style={{ minHeight: "100vh", background: "#020408", padding: "0 0 80px" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "linear-gradient(rgba(0,255,200,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,200,.025) 1px,transparent 1px)", backgroundSize: "40px 40px", animation: "gridScroll 4s linear infinite" }} />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 70% 40% at 50% 0%,rgba(0,255,180,.05) 0%,transparent 70%)" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: "#0ff8", letterSpacing: "0.25em", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#0ff", animation: "pulse 1.5s infinite" }} />
            FORENSIC AI ENGINE v3.1.4
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#0ff", animation: "pulse 1.5s infinite .5s" }} />
          </div>
          <h1 style={{ fontFamily: "'Rajdhani'", fontSize: "clamp(36px,7vw,64px)", fontWeight: 700, letterSpacing: "0.05em", lineHeight: 1, marginBottom: 10 }}>
            <span style={{ color: "#c8d8e8" }}>IMAGE </span><span style={{ color: "#0ff", textShadow: "0 0 30px #0ff8" }}>FORGERY</span><br />
            <span style={{ color: "#c8d8e8" }}>DETECTION</span>
          </h1>
          <p style={{ fontFamily: "'Share Tech Mono'", fontSize: 12, color: "#4a6a7a", letterSpacing: "0.08em" }}>
            MULTI-SIGNAL FORENSIC ANALYSIS · ELA · DCT · PRNU · DEEPFAKE DETECTION
          </p>
        </div>

        {/* Upload / Preview */}
        <div style={{ background: "#ffffff03", border: "1px solid #0ff2", borderRadius: 16, overflow: "hidden", marginBottom: 20, animation: "borderGlow 4s ease infinite" }}>
          {!preview ? (
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              style={{ minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, cursor: "pointer", padding: 40, background: dragging ? "rgba(0,255,200,.04)" : "transparent", transition: "background .2s" }}>
              <div style={{ position: "relative", width: 72, height: 72 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid #0ff3" }} />
                <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "1px solid #0ff3" }} />
                <div style={{ position: "absolute", inset: 16, borderRadius: "50%", border: "1px solid #0ff5", background: "#0ff08" }} />
                <div style={{ position: "absolute", top: 0, left: "50%", width: "50%", height: "50%", transformOrigin: "0% 100%", background: "conic-gradient(from 0deg, #0ff22, #0ff00)", animation: "radarSpin 2s linear infinite", borderRadius: "0 100% 0 0" }} />
              </div>
              <div style={{ fontFamily: "'Rajdhani'", fontSize: 20, fontWeight: 600, color: "#c8d8e8" }}>{dragging ? "RELEASE TO UPLOAD" : "DROP IMAGE TO ANALYZE"}</div>
              <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: "#4a6a7a", textAlign: "center", lineHeight: 1.8 }}>
                OR <span style={{ color: "#0ff" }}>BROWSE FILES</span><br />JPG · PNG · WEBP · BMP
              </div>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>
          ) : (
            <div>
              <div style={{ position: "relative", background: "#000", overflow: "hidden" }}>
                <img ref={imgRef} src={preview} alt="uploaded" crossOrigin="anonymous"
                  style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block", opacity: scanning ? 0.7 : 1, transition: "opacity .3s" }} />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                {scanning && (
                  <>
                    <div style={{ position: "absolute", left: 0, right: 0, height: 3, top: `${scanPos}%`, background: "linear-gradient(90deg,transparent,#0ff,#0ff,transparent)", boxShadow: "0 0 20px #0ff, 0 0 40px #0ff8", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: 0, right: 0, height: 60, top: `calc(${scanPos}% - 60px)`, background: "linear-gradient(180deg,transparent,rgba(0,255,255,.06))", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", inset: 0, background: "rgba(2,4,8,.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: 16, gap: 8 }}>
                      <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: "#0ff", background: "rgba(2,4,8,.85)", padding: "6px 14px", borderRadius: 4, letterSpacing: "0.1em", animation: "pulse .8s infinite" }}>
                        ■ {SCAN_STEPS[Math.min(stepIdx, SCAN_STEPS.length - 1)] || SCAN_STEPS[0]}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {SCAN_STEPS.map((_, i) => (<div key={i} style={{ width: 20, height: 2, borderRadius: 2, background: i <= stepIdx ? "#0ff" : "#0ff2", transition: "background .3s" }} />))}
                      </div>
                    </div>
                  </>
                )}
                {["topLeft","topRight","bottomLeft","bottomRight"].map(c => (
                  <div key={c} style={{ position: "absolute", ...(c.includes("top") ? { top: 8 } : { bottom: 8 }), ...(c.includes("Left") ? { left: 8 } : { right: 8 }), width: 16, height: 16, borderTop: c.includes("top") ? "2px solid #0ff" : "none", borderBottom: c.includes("bottom") ? "2px solid #0ff" : "none", borderLeft: c.includes("Left") ? "2px solid #0ff" : "none", borderRight: c.includes("Right") ? "2px solid #0ff" : "none", opacity: 0.7 }} />
                ))}
                {!scanning && <button onClick={reset} style={{ position: "absolute", top: 10, right: 10, background: "rgba(2,4,8,.8)", border: "1px solid #ff2d5588", color: "#ff2d55", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}
              </div>

              {apiError && (
                <div style={{ margin: 16, padding: "12px 16px", background: "rgba(255,45,85,.08)", border: "1px solid #ff2d5540", borderRadius: 10, fontFamily: "'Share Tech Mono'", fontSize: 12, color: "#ff2d55", display: "flex", gap: 10, alignItems: "center" }}>
                  <span>⚠</span> {apiError} — is the backend running on port 8000?
                </div>
              )}

              {!scanning && !result && (
                <div style={{ padding: 20 }}>
                  <button onClick={runScan} style={{ width: "100%", padding: "14px 0", background: "linear-gradient(135deg,#0ff1,#0ff2)", border: "1px solid #0ff6", borderRadius: 10, color: "#0ff", fontFamily: "'Rajdhani'", fontSize: 17, fontWeight: 700, letterSpacing: "0.15em", cursor: "pointer", boxShadow: "0 0 20px #0ff3, inset 0 0 20px #0ff08" }}>
                    ▶ INITIATE FORENSIC ANALYSIS
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn .6s ease" }}>

            {/* Verdict */}
            <div style={{ background: `rgba(${verdictAccent},.06)`, border: `1px solid rgba(${verdictAccent},.3)`, borderRadius: 16, padding: "24px 28px", display: "flex", alignItems: "center", gap: 20, boxShadow: `0 0 40px rgba(${verdictAccent},.1)` }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `rgba(${verdictAccent},.12)`, border: `2px solid ${verdictColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, boxShadow: `0 0 20px rgba(${verdictAccent},.4)` }}>
                {result.verdict === "AUTHENTIC" ? "✓" : result.verdict === "SUSPICIOUS" ? "⚠" : "✗"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 10, color: "#4a6a7a", letterSpacing: "0.15em", marginBottom: 4 }}>FORENSIC VERDICT</div>
                <div style={{ fontFamily: "'Rajdhani'", fontSize: 30, fontWeight: 800, color: verdictColor, letterSpacing: "0.1em", lineHeight: 1, textShadow: `0 0 20px ${verdictColor}88` }}>{result.verdict}</div>
              </div>
              <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 10, color: "#4a6a7a", textAlign: "right", lineHeight: 2 }}>
                <div>FILE: {result.filename?.slice(0, 18) || "—"}</div>
                <div>TIME: {new Date().toLocaleTimeString()}</div>
                <div style={{ color: verdictColor }}>SOURCE: API</div>
              </div>
            </div>

            {/* 4 Metric Cards — values from API */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              <MetricCard label="AI Generated"    value={result.aiGenerated}  color="#ff2d55" delay={0} />
              <MetricCard label="Tampering Score" value={result.tampering}    color="#ffb800" delay={100} />
              <MetricCard label="Authenticity"    value={result.authenticity} color="#00ff9d" delay={200} />
              <MetricCard label="Deepfake Risk"   value={result.deepfakeRisk} color="#bf5af2" delay={300} />
            </div>

            {/* Signals + Heatmap */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#ffffff03", border: "1px solid #0ff15", borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontFamily: "'Rajdhani'", fontSize: 14, fontWeight: 700, color: "#4a8a9a", letterSpacing: "0.15em", marginBottom: 4 }}>FORENSIC SIGNAL BREAKDOWN</div>
                <SignalRow label="ELA"      value={result.signals.ela}      color="#ff2d55" delay={100} />
                <SignalRow label="DCT"      value={result.signals.dct}      color="#ffb800" delay={200} />
                <SignalRow label="PRNU"     value={result.signals.prnu}     color="#00ff9d" delay={300} />
                <SignalRow label="SEMANTIC" value={result.signals.semantic} color="#0ff"    delay={400} />
                <SignalRow label="NOISE"    value={result.signals.noise}    color="#bf5af2" delay={500} />
              </div>

              <div style={{ background: "#ffffff03", border: "1px solid #ff2d5520", borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontFamily: "'Rajdhani'", fontSize: 14, fontWeight: 700, color: "#4a8a9a", letterSpacing: "0.15em" }}>MANIPULATION MAP</div>
                  <button onClick={() => setShowCompare(v => !v)} style={{ fontFamily: "'Share Tech Mono'", fontSize: 10, color: "#0ff", background: "transparent", border: "1px solid #0ff4", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
                    {showCompare ? "HEATMAP" : "COMPARE"}
                  </button>
                </div>
                {heatmapCanvas
                  ? showCompare
                    ? <CompareSlider original={preview} heatmapCanvas={heatmapCanvas} />
                    : <img src={heatmapCanvas.toDataURL()} alt="heatmap" style={{ width: "100%", borderRadius: 8, maxHeight: 200, objectFit: "contain" }} />
                  : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#2a4a5a", fontFamily: "'Share Tech Mono'", fontSize: 11 }}>RENDERING…</div>
                }
              </div>
            </div>

            {/* Full-width compare */}
            {showCompare && heatmapCanvas && (
              <div style={{ background: "#ffffff03", border: "1px solid #0ff15", borderRadius: 14, padding: 20 }}>
                <div style={{ fontFamily: "'Rajdhani'", fontSize: 14, fontWeight: 700, color: "#4a8a9a", letterSpacing: "0.15em", marginBottom: 14 }}>
                  BEFORE / AFTER — <span style={{ color: "#0ff8", fontFamily: "'Share Tech Mono'", fontSize: 11 }}>DRAG THE DIVIDER</span>
                </div>
                <CompareSlider original={preview} heatmapCanvas={heatmapCanvas} />
              </div>
            )}

            <button onClick={runScan} style={{ width: "100%", padding: "12px 0", background: "transparent", border: "1px solid #0ff2", borderRadius: 10, color: "#4a6a7a", fontFamily: "'Share Tech Mono'", fontSize: 12, letterSpacing: "0.12em", cursor: "pointer" }}>
              ↻ RUN ANALYSIS AGAIN
            </button>
          </div>
        )}

        <div style={{ marginTop: 48, textAlign: "center", fontFamily: "'Share Tech Mono'", fontSize: 10, color: "#2a3a4a", letterSpacing: "0.1em" }}>
          FORENSIC ENGINE · API-CONNECTED · DEBAN © 2026
        </div>
      </div>
    </div>
  );
}