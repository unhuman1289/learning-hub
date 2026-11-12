"use client";


import type { ReactNode } from "react";
import { OakDesk } from "../../../components/notebook/house";
import { MiniCover, RuledPage } from "../../../components/notebook/paper";
import { RouteLink } from "../ui";
import type { BookPage, NotebookTab, Route } from "../use-route";
import { coverTransition, type TrackId } from "../model";
import { LubeckWindow, useBerlinClock } from "../lubeck/window";
import { words } from "../words";

const tabs = [
  { page: "hom-nay", label: "Hôm nay", color: "bg-postit-mint" },
  { page: "muc-luc", label: words.place.contents, color: "bg-postit-yellow" },
  { page: "tien-do", label: "Tiến độ", color: "bg-postit-rose" },
] as const;

type BookNavigation = { id: string; page: BookPage | "lesson" } | { track: TrackId; tab: NotebookTab };
const legacyTabs = [
  { page: "muc-luc", label: words.place.contents, color: "bg-postit-yellow" },
  { page: "bai", label: "Bài học", color: "bg-postit-mint" },
  { page: "tai-lieu", label: "Tài liệu", color: "bg-postit-rose" },
] as const;

export function Book({ title, go, children, ...current }: {
  title: string; go: (route: Route) => void; children: ReactNode;
} & BookNavigation) {
  const legacy = "track" in current;
  const settings: Route = legacy
    ? { view: "notebook", track: current.track, tab: "muc-tieu" }
    : { view: "book", id: current.id, page: "cai-dat" };
  const links = legacy
    ? legacyTabs.map(tab => ({ ...tab, route: { view: "notebook", track: current.track, tab: tab.page } as const }))
    : tabs.map(tab => ({ ...tab, route: { view: "book", id: current.id, page: tab.page } as const }));
  const active = legacy ? current.tab : current.page;
  const reading = active === "lesson";
  const close: Route = !legacy && reading ? { view: "book", id: current.id, page: "hom-nay" } : { view: "desk" };
  return <div className={`mx-auto w-full ${reading ? "max-w-[76rem]" : "max-w-5xl"}`}>
    {!legacy && active === "hom-nay" && <div className="mx-auto hidden max-w-3xl overflow-hidden rounded-t-sm xl:block">
      <WindowStrip />
    </div>}
    <OakDesk drawers={!reading} className={reading ? "sm:[&>.bg-oak-planks]:pt-2" : undefined}>
    <div className="flex items-center justify-between gap-3 text-oak-ink">
      <RouteLink route={close} go={go} className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-oak-dark px-2 font-hand text-lg hover:underline">
        <span aria-hidden="true">←</span>{words.action.close}
      </RouteLink>
      {!legacy && <span aria-hidden="true" style={{ viewTransitionName: `cover-${current.id}` }}><MiniCover className="w-8" /></span>}
      {legacy && <h1 className="truncate rounded-sm bg-oak-dark px-2 font-print text-2xl" style={{ viewTransitionName: coverTransition[current.track] }}>{title}</h1>}
      <RouteLink route={settings} go={go} aria-label={words.place.settings}
        aria-current={active === "cai-dat" || active === "muc-tieu" ? "page" : undefined} className="grid size-11 place-items-center rounded-sm bg-oak-dark hover:underline"><span aria-hidden="true" className="text-xl">⚙</span></RouteLink>
    </div>
    <div style={{ viewTransitionName: "book" }} className="grid min-w-0 items-start gap-y-1 sm:grid-cols-[minmax(0,1fr)_6rem]">
      <nav aria-label="Trang trong sổ" className="flex flex-wrap items-center gap-1 sm:col-start-2 sm:row-start-1 sm:mt-9 sm:flex-col sm:items-stretch">
        {links.map(tab => <RouteLink key={tab.page} route={tab.route} go={go}
          aria-current={active === tab.page ? "page" : undefined}
          className={`inline-flex min-h-11 items-center justify-center rounded-sm px-3 font-hand text-lg text-postit-ink hover:underline aria-[current=page]:underline ${tab.color}`}>{tab.label}</RouteLink>)}
      </nav>
      {legacy || reading
        ? <div className="min-w-0 sm:col-start-1 sm:row-start-1">{children}</div>
        : <RuledPage className="min-h-[26rem] shadow-page sm:col-start-1 sm:row-start-1">
          <h1 className="mb-4 break-words font-print text-4xl leading-tight">{title}</h1>
          {children}
        </RuledPage>}
    </div>
    </OakDesk>
  </div>;
}

function WindowStrip() {
  const clock = useBerlinClock();
  return <div className="h-20 overflow-hidden [&>svg]:-translate-y-18"><LubeckWindow clock={clock} /></div>;
}
