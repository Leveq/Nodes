import { useEffect, useRef, useState } from "react";

interface NodeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  glowRadius: number;
  phase: number;
  brightness: number;
  color: 0 | 1 | 2; // 0 = ice-blue, 1 = soft-white, 2 = teal
}

interface SplashScreenProps {
  onDone: () => void;
  onFirstPaint?: () => void;
  duration?: number;
}

const CORE_COLOR = "#ffffff";
const COLORS_GLOW = ["#4fc3f7", "#c8e8ff", "#00e5cc"];
const NODE_COUNT = 55;
const MAX_EDGE_DIST = 130;
const FADE_DURATION = 800;

export function SplashScreen({ onDone, onFirstPaint, duration = 2800 }: SplashScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<NodeParticle[]>([]);
  const [fading, setFading] = useState(false);
  const firstPaintFiredRef = useRef(false);
  const onFirstPaintRef = useRef(onFirstPaint);
  onFirstPaintRef.current = onFirstPaint;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    nodesRef.current = Array.from({ length: NODE_COUNT }, () => {
      const radius = 1.8 + Math.random() * 2.2;
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.54) * 0.22,
        radius,
        glowRadius: radius * 4 + Math.random() * 8, // proportional, max ~26px
        phase: Math.random() * Math.PI * 2,
        brightness: 0.3 + Math.random() * 0.7,
        color: ([0, 0, 1, 2, 1] as const)[Math.floor(Math.random() * 5)],
      };
    });

    const draw = (now: number) => {
      const t = now / 1000;
      const W = window.innerWidth;
      const H = window.innerHeight;

      // Pure black — PS2 void
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      const nodes = nodesRef.current;

      // Drift & wrap
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -80) n.x = W + 80;
        else if (n.x > W + 80) n.x = -80;
        if (n.y < -80) n.y = H + 80;
        else if (n.y > H + 80) n.y = -80;
      }

      // Faint connection lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_EDGE_DIST) {
            const proximity = 1 - dist / MAX_EDGE_DIST;
            const avgB = (nodes[i].brightness + nodes[j].brightness) / 2;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = "#a8d8ff";
            ctx.globalAlpha = proximity * avgB * 0.14;
            ctx.lineWidth = 0.5;
            ctx.shadowColor = "#a8d8ff";
            ctx.shadowBlur = 3;
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Glowing orbs
      for (const n of nodes) {
        const pulse = 0.84 + 0.16 * Math.sin(t * 1.3 + n.phase);
        const b = n.brightness * pulse;
        const glowColor = COLORS_GLOW[n.color];
        const gr = n.glowRadius * pulse;

        // Wide outer diffuse halo
        const outerGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gr);
        const a1 = Math.round(b * 0.11 * 255).toString(16).padStart(2, "0");
        const a2 = Math.round(b * 0.035 * 255).toString(16).padStart(2, "0");
        outerGrad.addColorStop(0, glowColor + a1);
        outerGrad.addColorStop(0.4, glowColor + a2);
        outerGrad.addColorStop(1, glowColor + "00");
        ctx.beginPath();
        ctx.arc(n.x, n.y, gr, 0, Math.PI * 2);
        ctx.fillStyle = outerGrad;
        ctx.fill();

        // Inner bloom
        const innerR = n.radius * 4 * pulse;
        const innerGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, innerR);
        const a3 = Math.round(b * 55).toString(16).padStart(2, "0");
        innerGrad.addColorStop(0, CORE_COLOR);
        innerGrad.addColorStop(0.25, glowColor + a3);
        innerGrad.addColorStop(1, glowColor + "00");
        ctx.beginPath();
        ctx.arc(n.x, n.y, innerR, 0, Math.PI * 2);
        ctx.fillStyle = innerGrad;
        ctx.fill();

        // Pinpoint core
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = CORE_COLOR;
        ctx.globalAlpha = b * 0.35;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      if (!firstPaintFiredRef.current) {
        firstPaintFiredRef.current = true;
        onFirstPaintRef.current?.();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Trigger fade-out after `duration` ms
  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), duration);
    const doneTimer = setTimeout(() => onDone(), duration + FADE_DURATION);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [duration, onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION}ms ease-out`,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
