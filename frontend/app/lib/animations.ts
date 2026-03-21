/**
 * Shared GSAP animation presets for GrooveGraph.
 *
 * Usage:
 *   import { entrancePreset, staggerCards } from "@/../../frontend/app/lib/animations";
 *
 * All functions accept an optional `gsap.TweenVars` override to customize.
 * Respects `prefers-reduced-motion` via `shouldAnimate()`.
 */

import gsap from "gsap";

/* ------------------------------------------------------------------ */
/*  Reduced-motion gate                                                */
/* ------------------------------------------------------------------ */

export function shouldAnimate(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------------ */
/*  Entrance presets                                                    */
/* ------------------------------------------------------------------ */

export interface EntranceOptions {
  y?: number;
  opacity?: number;
  duration?: number;
  ease?: string;
  delay?: number;
}

const ENTRANCE_DEFAULTS: EntranceOptions = {
  y: 20,
  opacity: 0,
  duration: 0.5,
  ease: "power2.out",
  delay: 0,
};

export function entranceFrom(
  targets: gsap.TweenTarget,
  overrides: EntranceOptions = {},
): gsap.core.Tween | undefined {
  if (!shouldAnimate()) return undefined;
  const opts = { ...ENTRANCE_DEFAULTS, ...overrides };
  return gsap.from(targets, {
    y: opts.y,
    opacity: opts.opacity,
    duration: opts.duration,
    ease: opts.ease,
    delay: opts.delay,
  });
}

/* ------------------------------------------------------------------ */
/*  Stagger presets                                                     */
/* ------------------------------------------------------------------ */

export interface StaggerOptions {
  y?: number;
  opacity?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
}

const STAGGER_DEFAULTS: StaggerOptions = {
  y: 16,
  opacity: 0,
  duration: 0.4,
  stagger: 0.08,
  ease: "power2.out",
};

export function staggerEntrance(
  targets: gsap.TweenTarget,
  overrides: StaggerOptions = {},
): gsap.core.Tween | undefined {
  if (!shouldAnimate()) return undefined;
  const opts = { ...STAGGER_DEFAULTS, ...overrides };
  return gsap.from(targets, {
    y: opts.y,
    opacity: opts.opacity,
    duration: opts.duration,
    stagger: opts.stagger,
    ease: opts.ease,
  });
}

/* ------------------------------------------------------------------ */
/*  Scale pop (badges, chips, nodes)                                   */
/* ------------------------------------------------------------------ */

export function scalePop(
  targets: gsap.TweenTarget,
  overrides: Partial<{ duration: number; ease: string; delay: number }> = {},
): gsap.core.Tween | undefined {
  if (!shouldAnimate()) return undefined;
  return gsap.from(targets, {
    scale: 0,
    opacity: 0,
    duration: overrides.duration ?? 0.35,
    ease: overrides.ease ?? "back.out(1.7)",
    delay: overrides.delay ?? 0,
  });
}

/* ------------------------------------------------------------------ */
/*  Fade                                                               */
/* ------------------------------------------------------------------ */

export function fadeIn(
  targets: gsap.TweenTarget,
  duration = 0.4,
): gsap.core.Tween | undefined {
  if (!shouldAnimate()) return undefined;
  return gsap.from(targets, { opacity: 0, duration, ease: "power1.out" });
}

export function fadeOut(
  targets: gsap.TweenTarget,
  duration = 0.25,
): gsap.core.Tween | undefined {
  if (!shouldAnimate()) return undefined;
  return gsap.to(targets, { opacity: 0, duration, ease: "power1.in" });
}

/* ------------------------------------------------------------------ */
/*  Pulse (enrichment halo, loading indicators)                        */
/* ------------------------------------------------------------------ */

export function pulse(
  targets: gsap.TweenTarget,
  overrides: Partial<{ minOpacity: number; maxOpacity: number; duration: number }> = {},
): gsap.core.Tween | undefined {
  if (!shouldAnimate()) return undefined;
  const min = overrides.minOpacity ?? 0.4;
  const max = overrides.maxOpacity ?? 1;
  gsap.set(targets, { opacity: max });
  return gsap.to(targets, {
    opacity: min,
    duration: overrides.duration ?? 1.2,
    ease: "power1.inOut",
    repeat: -1,
    yoyo: true,
  });
}

/* ------------------------------------------------------------------ */
/*  Timeline factory                                                   */
/* ------------------------------------------------------------------ */

export function createTimeline(
  defaults?: gsap.TweenVars,
): gsap.core.Timeline | undefined {
  if (!shouldAnimate()) return undefined;
  return gsap.timeline({ defaults: { ease: "power2.out", ...defaults } });
}
