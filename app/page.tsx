"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampDetectionRadius,
  distanceBetweenLy,
  expansionReachesTarget,
  maxDetectionRadius,
} from "@/lib/simulation.mjs";

type ScaleKey = "galaxy" | "local" | "universe";
type Params = {
  habitable: number;
  life: number;
  intelligence: number;
  lifetime: number;
  expansion: number;
  detect: number;
};

type Civilization = {
  id: number;
  x: number;
  y: number;
  z: number;
  born: number;
  death: number;
  expansionAt: number;
  weight: number;
};

const AGE = 13.8;

const scales: Record<
  ScaleKey,
  { name: string; eyebrow: string; diameter: number; stars: number; note: string }
> = {
  galaxy: {
    name: "银河系",
    eyebrow: "单星系实验",
    diameter: 100_000,
    stars: 1e11,
    note: "约 10 万光年直径 · 约 1,000 亿颗恒星",
  },
  local: {
    name: "本星系群",
    eyebrow: "星系群实验",
    diameter: 10_000_000,
    stars: 3e12,
    note: "约 1,000 万光年跨度 · 数十个星系",
  },
  universe: {
    name: "可观测宇宙",
    eyebrow: "宇宙尺度实验",
    diameter: 93_000_000_000,
    stars: 1e24,
    note: "约 930 亿光年直径 · 恒星数最高估至 10²⁴",
  },
};

const presets: Record<string, Params> = {
  silence: {
    habitable: -1,
    life: -2,
    intelligence: -6,
    lifetime: 4,
    expansion: 0.01,
    detect: 1_000,
  },
  crowded: {
    habitable: -0.5,
    life: -1,
    intelligence: -4,
    lifetime: 6,
    expansion: 0.1,
    detect: 50_000,
  },
  filter: {
    habitable: -1,
    life: -0.7,
    intelligence: -8,
    lifetime: 3,
    expansion: 0.001,
    detect: 500,
  },
};

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatCount(value: number, digits = 1) {
  if (value < 0.01) return "< 0.01";
  if (value < 1_000) return value.toFixed(value < 10 ? digits : 0);
  const exp = Math.floor(Math.log10(value));
  return `${(value / 10 ** exp).toFixed(1)} × 10^${exp}`;
}

function formatProbability(value: number) {
  const percent = value * 100;
  if (percent >= 99.95) return "> 99.9%";
  if (percent < 0.001) return "< 0.001%";
  return `${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}

function poissonish(mean: number, rand: () => number) {
  if (mean < 40) {
    let p = 1;
    let k = 0;
    const limit = Math.exp(-mean);
    do {
      k++;
      p *= rand();
    } while (p > limit && k < 2_000);
    return Math.max(0, k - 1);
  }
  return Math.max(0, Math.round(mean + Math.sqrt(mean) * (rand() + rand() + rand() + rand() - 2)));
}

function buildCivilizations(
  scale: ScaleKey,
  params: Params,
  seed: number,
) {
  const rand = mulberry32(seed);
  const meta = scales[scale];
  const expectedTotal =
    meta.stars *
    10 ** params.habitable *
    10 ** params.life *
    10 ** params.intelligence;
  const target = Math.min(900, poissonish(Math.min(expectedTotal, 1e6), rand));
  const count = expectedTotal > 1e6 ? 900 : target;
  const weight = count ? expectedTotal / count : 1;
  const meanLifeGyr = 10 ** params.lifetime / 1e9;

  const civs: Civilization[] = Array.from({ length: count }, (_, id) => {
    const theta = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand());
    const flatten = scale === "galaxy" ? 0.15 : 0.85;
    const born = 1.2 + Math.pow((rand() + rand() + rand()) / 3, 0.72) * 12.2;
    const lifetime =
      Math.max(1e-7, meanLifeGyr * 10 ** ((rand() + rand() - 1) * 1.35));
    const techDelay = Math.min(lifetime * 0.55, 0.0002 * (0.5 + rand()));
    return {
      id,
      x: Math.cos(theta) * radius,
      y: Math.sin(theta) * radius * flatten,
      z: (rand() * 2 - 1) * radius * flatten,
      born,
      death: born + lifetime,
      expansionAt: born + techDelay,
      weight,
    };
  });

  // Earth is guaranteed as the known observation, without changing the probability estimate.
  civs.push({
    id: 10_000,
    x: scale === "galaxy" ? 0.34 : 0.012,
    y: scale === "galaxy" ? 0.11 : -0.008,
    z: 0,
    born: AGE - 0.0003,
    death: AGE + 0.0008,
    expansionAt: AGE - 0.00012,
    weight: 1,
  });
  return { civs, expectedTotal, meanLifeGyr };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="control">
      <span>
        {label}
        <b>{display}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function Home() {
  const [scale, setScale] = useState<ScaleKey>("galaxy");
  const [params, setParams] = useState<Params>(presets.silence);
  const [seed, setSeed] = useState(2718);
  const [time, setTime] = useState(AGE);
  const [playing, setPlaying] = useState(false);
  const [showSignals, setShowSignals] = useState(true);
  const [showExpansion, setShowExpansion] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const model = useMemo(
    () => buildCivilizations(scale, params, seed),
    [scale, params, seed],
  );
  const meta = scales[scale];
  const detectionRadius = Math.min(
    params.detect,
    maxDetectionRadius(meta.diameter),
  );
  const calculation = useMemo(() => {
    const habitableRate = 10 ** params.habitable;
    const lifeRate = 10 ** params.life;
    const intelligenceRate = 10 ** params.intelligence;
    const lifetimeYears = 10 ** params.lifetime;
    const habitableEraYears = 12.2e9;
    const expectedActive =
      model.expectedTotal * Math.min(1, lifetimeYears / habitableEraYears);
    const atLeastOne = 1 - Math.exp(-Math.min(expectedActive, 750));
    const sampleCount = Math.max(0, model.civs.length - 1);
    const sampleWeight =
      sampleCount > 0 ? Math.max(1, model.expectedTotal / sampleCount) : 0;
    return {
      habitableRate,
      lifeRate,
      intelligenceRate,
      lifetimeYears,
      expectedActive,
      atLeastOne,
      sampleCount,
      sampleWeight,
      expansionInMillionYears: params.expansion * 1_000_000,
    };
  }, [model, params]);

  const stats = useMemo(() => {
    const r = meta.diameter / 2;
    let active = 0;
    let extinct = 0;
    let arrived = 0;
    let reached = 0;
    let expanding = 0;
    const earth = model.civs[model.civs.length - 1];

    for (const c of model.civs) {
      if (c.id === 10_000) continue;
      const distLy = distanceBetweenLy(c, earth, r);
      const lightTravelGyr = distLy / 1e9;
      const detectable =
        distLy <= detectionRadius &&
        time >= c.expansionAt + lightTravelGyr &&
        time <= c.death + lightTravelGyr;
      const expansionReached = expansionReachesTarget({
        distanceLy: distLy,
        expansionAtGyr: c.expansionAt,
        deathGyr: c.death,
        timeGyr: time,
        speedFractionC: params.expansion,
      });
      if (time >= c.born && time <= c.death) active += c.weight;
      if (time > c.death) extinct += c.weight;
      if (detectable) arrived += c.weight;
      if (expansionReached) reached += c.weight;
      if (
        time >= c.expansionAt &&
        time <= c.death &&
        params.expansion > 0
      )
        expanding += c.weight;
    }
    return { active, extinct, arrived, reached, expanding };
  }, [detectionRadius, model, meta, params.expansion, time]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTime((t) => (t >= AGE ? 0 : Math.min(AGE, t + 0.035)));
    }, 28);
    return () => window.clearInterval(timer);
  }, [playing]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const cx = w * 0.5;
    const cy = h * 0.49;
    const radius = Math.min(w, h) * 0.405;
    const rand = mulberry32(112358);

    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.35);
    bg.addColorStop(0, "#0c1830");
    bg.addColorStop(0.52, "#070d19");
    bg.addColorStop(1, "#03060d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    for (let i = 0; i < 520; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * radius;
      const alpha = 0.18 + rand() * 0.55;
      ctx.fillStyle = `rgba(205,224,255,${alpha})`;
      ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rand() > 0.92 ? 1.6 : 0.7, rand() > 0.92 ? 1.6 : 0.7);
    }

    if (scale === "galaxy") {
      ctx.globalCompositeOperation = "screen";
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let i = 0; i < 180; i++) {
          const rr = (i / 180) * radius * 0.96;
          const a = arm * ((Math.PI * 2) / 3) + i * 0.034;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr * 0.38;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(89, 134, 190, .11)";
        ctx.lineWidth = 18;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    const earth = model.civs[model.civs.length - 1];
    const ex = cx + earth.x * radius;
    const ey = cy + earth.y * radius;
    const viewRadiusLy = meta.diameter / 2;

    if (showSignals) {
      const detectR = Math.min(radius, (detectionRadius / viewRadiusLy) * radius);
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(3, detectR), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(119, 211, 255, .42)";
      ctx.setLineDash([4, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const c of model.civs) {
      if (c.id === 10_000 || time < c.born) continue;
      const x = cx + c.x * radius;
      const y = cy + c.y * radius;
      const active = time <= c.death;
      const recentFlash = !active && time - c.born < 0.04;
      const age = Math.max(0, time - c.expansionAt);
      const expansionLy = age * 1e9 * params.expansion;
      const expansionPx = Math.min(radius * 0.8, (expansionLy / viewRadiusLy) * radius);

      if (active && showExpansion && expansionPx > 1) {
        ctx.beginPath();
        ctx.arc(x, y, expansionPx, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(242, 174, 76, .13)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, y, active ? 2.2 : recentFlash ? 1.7 : 1.15, 0, Math.PI * 2);
      ctx.fillStyle = active
        ? "#f7bd65"
        : recentFlash
          ? "rgba(247,189,101,.48)"
          : "rgba(136,151,173,.28)";
      ctx.fill();
      if (active) {
        ctx.shadowColor = "#f3a641";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    ctx.beginPath();
    ctx.arc(ex, ey, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = "#7bd6ff";
    ctx.shadowColor = "#4fc8ff";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(157,182,214,.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#88cdea";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText("YOU ARE HERE", ex + 10, ey - 8);
  }, [detectionRadius, model, meta, params.expansion, scale, showExpansion, showSignals, time]);

  useEffect(() => {
    draw();
    const handler = () => draw();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [draw]);

  const setParam = (key: keyof Params, value: number) =>
    setParams((p) => ({ ...p, [key]: value }));

  const verdict =
    stats.reached >= 1
      ? "他们的足迹已经抵达这里"
      : stats.arrived >= 1
      ? "这一次，我们不再孤独"
      : stats.active >= 1
        ? "他们或许活着，只是太远"
        : stats.extinct >= 1
          ? "宇宙曾经热闹，但我们错过了"
          : "在这一轮宇宙里，只有我们";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="寂静宇宙首页">
          <span className="brand-mark">◉</span>
          <span>寂静宇宙</span>
          <small>FERMI LAB</small>
        </a>
        <div className="scale-tabs" aria-label="模拟空间尺度">
          {(Object.keys(scales) as ScaleKey[]).map((key) => (
            <button
              className={scale === key ? "active" : ""}
              key={key}
              aria-pressed={scale === key}
              onClick={() => {
                setScale(key);
                setParams((current) => ({
                  ...current,
                  detect: clampDetectionRadius(
                    current.detect,
                    scales[key].diameter,
                  ),
                }));
              }}
            >
              {scales[key].name}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          title="重新抽样"
          aria-label="重新抽样宇宙"
          onClick={() => setSeed((s) => s + 1)}
        >
          ↻
        </button>
      </header>

      <section className="hero" id="top">
        <div className="intro">
          <p className="kicker">
            <span />
            MONTE CARLO EXPERIMENT / {meta.eyebrow}
          </p>
          <h1>
            宇宙这么大，
            <br />
            <em>为什么只有我们？</em>
          </h1>
          <p className="lede">
            让文明在 138 亿年的时空中诞生、扩张与熄灭。
            你看见的不是答案，而是费米悖论为何如此难解。
          </p>
        </div>

        <div className="observatory">
          <canvas ref={canvasRef} aria-label="文明时空分布模拟图" />
          <div className="view-meta">
            <span>OBSERVATION VOLUME</span>
            <strong>{meta.name}</strong>
            <small>{meta.note}</small>
          </div>
          <div className="legend">
            <span><i className="earth-dot" /> 地球</span>
            <span><i className="active-dot" /> 活跃文明</span>
            <span><i className="dead-dot" /> 已灭亡</span>
          </div>
          <div className="view-actions">
            <button
              className={showSignals ? "on" : ""}
              aria-pressed={showSignals}
              onClick={() => setShowSignals((v) => !v)}
            >
              信号视界
            </button>
            <button
              className={showExpansion ? "on" : ""}
              aria-pressed={showExpansion}
              onClick={() => setShowExpansion((v) => !v)}
            >
              扩张波
            </button>
          </div>
        </div>

        <aside className="outcome">
          <p>本轮结论</p>
          <h2>{verdict}</h2>
          <div className="outcome-grid">
            <div>
              <span>此刻活跃</span>
              <strong>{formatCount(stats.active)}</strong>
            </div>
            <div>
              <span>信号抵达</span>
              <strong className={stats.arrived > 0 ? "cyan" : ""}>
                {formatCount(stats.arrived)}
              </strong>
            </div>
            <div>
              <span>扩张触达</span>
              <strong className={stats.reached > 0 ? "gold" : ""}>
                {formatCount(stats.reached)}
              </strong>
            </div>
            <div>
              <span>曾经存在</span>
              <strong>{formatCount(stats.extinct + stats.active)}</strong>
            </div>
          </div>
          <p className="outcome-note">
            “存在”不等于“同时存在”；信号可以先于文明抵达，扩张则必须在文明熄灭前跨越距离。
          </p>
        </aside>
      </section>

      <section className="timeline-section">
        <div className="time-readout">
          <span>宇宙时间</span>
          <strong>{time.toFixed(2)}</strong>
          <small>十亿年</small>
        </div>
        <button
          className="play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "暂停模拟" : "播放模拟"}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <div className="timeline">
          <input
            type="range"
            min="0"
            max={AGE}
            step="0.01"
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
          />
          <div className="time-labels">
            <span>宇宙大爆炸</span>
            <span>第一批恒星</span>
            <span>太阳形成</span>
            <span>今天</span>
          </div>
        </div>
        <button
          className="now-button"
          onClick={() => {
            setPlaying(false);
            setTime(AGE);
          }}
        >
          回到今天
        </button>
      </section>

      <section className="lab">
        <div className="lab-heading">
          <p className="kicker"><span /> 改写宇宙的命运</p>
          <h2>实验参数</h2>
          <p>概率使用 10 的幂次表示；每次修改都会重新计算同一个宇宙样本。</p>
        </div>
        <div className="preset-row">
          <button onClick={() => setParams(presets.silence)}>大寂静</button>
          <button onClick={() => setParams(presets.filter)}>大过滤器</button>
          <button onClick={() => setParams(presets.crowded)}>拥挤宇宙</button>
          <button className="reroll" onClick={() => setSeed((s) => s + 1)}>
            ↻ 生成另一个宇宙
          </button>
        </div>
        <div className="control-grid">
          <Slider
            label="恒星拥有宜居世界"
            value={params.habitable}
            min={-4}
            max={0}
            step={0.1}
            display={`10^${params.habitable.toFixed(1)}`}
            onChange={(v) => setParam("habitable", v)}
          />
          <Slider
            label="宜居世界诞生生命"
            value={params.life}
            min={-12}
            max={0}
            step={0.1}
            display={`10^${params.life.toFixed(1)}`}
            onChange={(v) => setParam("life", v)}
          />
          <Slider
            label="生命发展出技术文明"
            value={params.intelligence}
            min={-16}
            max={0}
            step={0.1}
            display={`10^${params.intelligence.toFixed(1)}`}
            onChange={(v) => setParam("intelligence", v)}
          />
          <Slider
            label="技术文明平均寿命"
            value={params.lifetime}
            min={2}
            max={9}
            step={0.1}
            display={`${formatCount(10 ** params.lifetime, 0)} 年`}
            onChange={(v) => setParam("lifetime", v)}
          />
          <Slider
            label="星际扩张速度"
            value={params.expansion}
            min={0}
            max={0.5}
            step={0.001}
            display={`${(params.expansion * 100).toFixed(1)}% 光速`}
            onChange={(v) => setParam("expansion", v)}
          />
          <Slider
            label="我们的有效探测半径"
            value={detectionRadius}
            min={10}
            max={maxDetectionRadius(meta.diameter)}
            step={10}
            display={`${formatCount(detectionRadius, 0)} 光年`}
            onChange={(v) => setParam("detect", v)}
          />
        </div>
      </section>

      <section className="calculation">
        <div className="calculation-heading">
          <p className="kicker"><span /> INSIDE THE MODEL</p>
          <h2>这个宇宙，是怎么算出来的？</h2>
          <p>
            先估算“历史上会诞生多少文明”，再给每个文明抽取诞生时间、寿命和位置，
            最后用光速限制判断它的信号此刻能否抵达地球。
          </p>
        </div>

        <div className="formula-flow">
          <article className="formula-card">
            <div className="formula-index">01 / 诞生</div>
            <h3>把三道未知门槛相乘</h3>
            <div className="formula">
              N<sub>born</sub> = N<sub>★</sub> × f<sub>hab</sub> ×
              f<sub>life</sub> × f<sub>tech</sub>
            </div>
            <p>
              恒星要依次跨过“有宜居世界、生命出现、发展出技术文明”三道门槛。
              任何一项很小，最终结果都会急剧下降。
            </p>
            <div className="substitution">
              <span>当前参数代入</span>
              <code>
                {formatCount(meta.stars, 0)} ×{" "}
                {calculation.habitableRate.toExponential(1)} ×{" "}
                {calculation.lifeRate.toExponential(1)} ×{" "}
                {calculation.intelligenceRate.toExponential(1)}
              </code>
              <strong>≈ {formatCount(model.expectedTotal)} 个文明曾诞生</strong>
            </div>
          </article>

          <article className="formula-card">
            <div className="formula-index">02 / 同时存在</div>
            <h3>文明寿命决定“时间重叠”</h3>
            <div className="formula">
              N<sub>active</sub> ≈ N<sub>born</sub> × L / T
            </div>
            <p>
              如果文明随机散布在约 122 亿年的可居住时代中，它此刻仍活跃的机会，
              粗略等于文明寿命 L 除以这段时间 T。
            </p>
            <div className="substitution">
              <span>当前参数代入</span>
              <code>
                {formatCount(model.expectedTotal)} ×{" "}
                {formatCount(calculation.lifetimeYears, 0)} / 1.22 × 10^10
              </code>
              <strong>
                期望活跃 {formatCount(calculation.expectedActive)} 个 · 至少一个的概率{" "}
                {formatProbability(calculation.atLeastOne)}
              </strong>
            </div>
          </article>

          <article className="formula-card">
            <div className="formula-index">03 / 看得见</div>
            <h3>信号必须落入我们的光锥</h3>
            <div className="formula">
              t<sub>on</sub> + d/c ≤ t<sub>now</sub> ≤ t<sub>off</sub> + d/c
            </div>
            <p>
              距离 d 光年的信号需要 d 年才能抵达。发得太晚，信号还在路上；
              停得太早，最后一束信号也可能已经掠过地球。
            </p>
            <div className="substitution">
              <span>当前观测窗口</span>
              <code>d ≤ {formatCount(detectionRadius, 0)} 光年</code>
              <strong>
                最远信号延迟 {formatCount(detectionRadius, 0)} 年 · 本轮抵达{" "}
                {formatCount(stats.arrived)} 个
              </strong>
            </div>
          </article>

          <article className="formula-card">
            <div className="formula-index">04 / 扩张与触达</div>
            <h3>扩张前沿也不能超过光速</h3>
            <div className="formula">
              t<sub>arrive</sub> = t<sub>expand</sub> + d / (βc)
            </div>
            <p>
              β 是光速的比例。只有扩张前沿在当前时刻之前抵达地球，且文明在抵达前
              没有熄灭，才记为一次“扩张触达”。文明过多时仍以带权重的代表样本计算。
            </p>
            <div className="substitution">
              <span>当前抽样</span>
              <code>
                n = {calculation.sampleCount} · w ≈{" "}
                {formatCount(calculation.sampleWeight)}
              </code>
              <strong>
                以当前速度扩张 100 万年，可达{" "}
                {formatCount(calculation.expansionInMillionYears, 0)} 光年 · 本轮触达{" "}
                {formatCount(stats.reached)} 个
              </strong>
            </div>
          </article>
        </div>

        <aside className="model-note">
          <div>
            <span>MONTE CARLO</span>
            <strong>公式给期望值，随机抽样给出“一次具体宇宙”。</strong>
          </div>
          <p>
            每个文明的诞生时间、寿命和空间位置都由带种子的伪随机数生成。
            所以相同参数也可能得到不同结局；“生成另一个宇宙”就是更换随机种子。
            当期望数量很小时，实际抽到零个并不是计算错误，而是概率本身的含义。
          </p>
        </aside>
      </section>

      <section className="explain">
        <div>
          <p className="kicker"><span /> HOW TO READ THIS</p>
          <h2>我们究竟错过了什么？</h2>
        </div>
        <div className="explain-cards">
          <article>
            <b>01</b>
            <h3>空间错位</h3>
            <p>即使银河系同时有两个文明，平均距离仍可能远超现有可确认的探测范围。</p>
          </article>
          <article>
            <b>02</b>
            <h3>时间错位</h3>
            <p>一个活跃一万年的文明，在百亿年尺度上只是约百万分之一秒的闪光。</p>
          </article>
          <article>
            <b>03</b>
            <h3>光锥错位</h3>
            <p>他们可能已经灭亡，但信号仍在路上；也可能信号早已掠过地球。</p>
          </article>
        </div>
      </section>

      <footer>
        <p>
          这是思想实验，不是生命概率的预测器。星体总量与宇宙年龄采用真实量级；
          生命概率、文明寿命与扩张行为仍是未知参数。
        </p>
        <div>
          <a href="https://science.nasa.gov/exoplanets/what-is-the-universe/" target="_blank" rel="noreferrer">NASA · 宇宙尺度</a>
          <a href="https://imagine.gsfc.nasa.gov/science/objects/milkyway1.html" target="_blank" rel="noreferrer">NASA · 银河系</a>
          <a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noreferrer">NASA · 系外行星档案</a>
        </div>
      </footer>
    </main>
  );
}
