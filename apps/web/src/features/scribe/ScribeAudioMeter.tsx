import { useEffect, useRef } from "react";

export function ScribeAudioMeter({
  level,
  active,
}: {
  level: number;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = 46;
    const height = 18;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    const normalized = active ? Math.max(0.08, Math.min(1, level / 100)) : 0.06;
    const profile = [0.34, 0.56, 0.78, 1, 0.68, 0.45];
    context.fillStyle = active ? "#11b95c" : "#b8c9bf";
    profile.forEach((weight, index) => {
      const barHeight = Math.max(
        3,
        height * Math.min(1, normalized * 1.7 * weight),
      );
      const x = index * 7.5 + 1;
      const y = (height - barHeight) / 2;
      context.beginPath();
      context.roundRect(x, y, 4, barHeight, 2);
      context.fill();
    });
  }, [active, level]);

  return (
    <canvas
      ref={canvasRef}
      role="meter"
      aria-label="Microphone input level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level)}
      width={46}
      height={18}
      style={{ display: "block", width: 46, height: 18 }}
    />
  );
}
