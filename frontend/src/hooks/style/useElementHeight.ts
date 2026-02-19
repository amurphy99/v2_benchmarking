import { useEffect, useState } from "react";

// Allow an element to share it's height with another on the page
export function useElementHeight<T extends HTMLElement>(ref: React.RefObject<T | null>) {
    const [height, setHeight] = useState<number | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            const h = entries[0]?.contentRect?.height;
            if (typeof h === "number") setHeight(h);
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);

  return height;
}
