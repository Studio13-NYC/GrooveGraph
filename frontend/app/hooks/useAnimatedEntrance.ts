"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { shouldAnimate } from "../lib/animations";

export interface UseAnimatedEntranceOptions {
  selector?: string;
  y?: number;
  opacity?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
  delay?: number;
}

/**
 * Hook that animates child elements into view on mount.
 *
 * Returns a ref to attach to the container element.
 *
 * @example
 * ```tsx
 * const ref = useAnimatedEntrance({ selector: ".card", stagger: 0.1 });
 * return <div ref={ref}><div className="card">…</div></div>;
 * ```
 */
export function useAnimatedEntrance<T extends HTMLElement = HTMLDivElement>(
  options: UseAnimatedEntranceOptions = {},
) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!containerRef.current || !shouldAnimate()) return;

    const ctx = gsap.context(() => {
      const targets = options.selector ?? "> *";
      gsap.from(targets, {
        y: options.y ?? 20,
        opacity: options.opacity ?? 0,
        duration: options.duration ?? 0.5,
        stagger: options.stagger ?? 0.08,
        ease: options.ease ?? "power2.out",
        delay: options.delay ?? 0,
      });
    }, containerRef);

    return () => ctx.revert();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return containerRef;
}
