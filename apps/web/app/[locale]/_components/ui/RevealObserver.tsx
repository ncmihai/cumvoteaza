"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Makes every `.reveal` block on the page fade up once when it first scrolls into view. One small client component in the layout, so the blocks themselves
 * stay plain server-rendered markup (a wrapper component would send their content to the browser twice, as HTML and as component data).
 * Nothing is hidden before the page has loaded, a block that starts inside the screen is never hidden, and reduced motion shows everything at once.
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    for (const element of document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)")) {
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.classList.add("is-armed");
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
