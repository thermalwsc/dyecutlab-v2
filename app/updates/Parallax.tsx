"use client";

/* Scroll parallax that behaves on every screen, iPhone included.

   Why JS and not CSS: `background-attachment: fixed` is ignored by iOS
   Safari, and CSS scroll-driven animations are not in every iPhone yet. So
   one shared, passive scroll listener (batched with requestAnimationFrame)
   nudges each wrapped block with translate3d, which stays on the GPU.

   - speed > 0  → drifts slower than the page (sits "behind")
   - speed < 0  → drifts faster (floats "in front")
   - max        → hard cap in px so a block never wanders far (or exposes
                  the edge of a clipped frame)
   - strength shrinks the effect on narrow screens and tablets
   - off-screen blocks are skipped (IntersectionObserver)
   - does nothing when the visitor asked for reduced motion

   The outer div is never transformed, so measuring it can't feed back into
   the position it is meant to compute. */

import { useEffect, useRef, type ReactNode } from "react";

type Item = { outer: HTMLElement; inner: HTMLElement; speed: number; max: number; visible: boolean };

const items = new Set<Item>();
const byElement = new Map<Element, Item>();
let observer: IntersectionObserver | null = null;
let frame = 0;
let listening = false;

function render() {
  frame = 0;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vh = window.innerHeight;
  const width = window.innerWidth;
  const strength = width < 640 ? 0.65 : width < 1024 ? 0.85 : 1;

  items.forEach((item) => {
    if (still) {
      item.inner.style.transform = "";
      return;
    }
    if (!item.visible) return;
    const rect = item.outer.getBoundingClientRect();
    const fromCentre = rect.top + rect.height / 2 - vh / 2;
    const y = Math.max(-item.max, Math.min(item.max, fromCentre * item.speed * strength));
    item.inner.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
  });
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
}

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const item = byElement.get(entry.target);
          if (item) item.visible = entry.isIntersecting;
        }
        schedule();
      },
      { rootMargin: "25% 0px" }
    );
  }
  return observer;
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
}

function unlisten() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  window.removeEventListener("orientationchange", schedule);
}

export default function Parallax({
  speed = 0.1,
  max = 120,
  className,
  innerClassName,
  children,
}: {
  speed?: number;
  max?: number;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const item: Item = { outer, inner, speed, max, visible: true };
    items.add(item);
    byElement.set(outer, item);
    getObserver().observe(outer);
    listen();
    schedule();

    return () => {
      items.delete(item);
      byElement.delete(outer);
      observer?.unobserve(outer);
      inner.style.transform = "";
      if (items.size === 0) unlisten();
    };
  }, [speed, max]);

  return (
    <div ref={outerRef} className={className}>
      <div ref={innerRef} className={innerClassName} style={{ willChange: "transform" }}>
        {children}
      </div>
    </div>
  );
}
