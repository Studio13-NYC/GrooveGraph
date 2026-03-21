"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { shouldAnimate } from "../lib/animations";

gsap.registerPlugin(ScrollTrigger);

export interface UseScrollRevealOptions {
  selector?: string;
  y?: number;
  opacity?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
  /** ScrollTrigger start position (default: "top 85%") */
  start?: string;
  /** If true, animation only plays once (default: true) */
  once?: boolean;
}

/**
 * Hook that reveals child elements as they scroll into the viewport.
 *
 * Returns a ref to attach to the container element.
 *
 * @example
 * ```tsx
 * const ref = useScrollReveal({ selector: ".item", stagger: 0.06 });
 * return <section ref={ref}><div className="item">…</div></section>;
 * ```
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollRevealOptions = {},
) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!containerRef.current || !shouldAnimate()) return;

    const ctx = gsap.context(() => {
      const targets = options.selector ?? "> *";
      gsap.from(targets, {
        y: options.y ?? 24,
        opacity: options.opacity ?? 0,
        duration: options.duration ?? 0.5,
        stagger: options.stagger ?? 0.08,
        ease: options.ease ?? "power2.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: options.start ?? "top 85%",
          toggleActions:
            options.once !== false
              ? "play none none none"
              : "play reverse play reverse",
        },
      });
    }, containerRef);

    return () => ctx.revert();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return containerRef;
}
