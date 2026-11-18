"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cx } from "../../components/notebook/paper";
import { routeHref, type Route } from "./use-route";

type Variant = "primary" | "secondary" | "ghost";

export function buttonClass(variant: Variant = "primary", extra?: string) {
  return cx("notebook-button", `notebook-${variant}`, extra);
}

/** A real link (open in new tab works) that navigates in-page on a plain click. */
export function RouteLink({ route, go, children, ...rest }: { route: Route; go: (route: Route) => void; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a
      {...rest}
      href={routeHref(route)}
      onClick={(event) => {
        rest.onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        go(route);
      }}
    >
      {children}
    </a>
  );
}

/** Small-caps section label that sits on one ruled line. */
export function PageLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx("text-xs font-semibold uppercase leading-7 tracking-[0.14em] text-muted", className)}>{children}</h3>;
}

export function HandNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("font-hand text-lg leading-7 text-accent", className)}>{children}</p>;
}
