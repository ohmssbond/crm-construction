import type { ReactNode } from "react";
import type { World } from "./nav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { Fab } from "./Fab";

/**
 * The one shell for both worlds. `world` sets `data-world` (the accent swap)
 * and the nav set — nothing else branches per world.
 */
export default function AppShell({
  world,
  children,
}: {
  world: World;
  children: ReactNode;
}) {
  return (
    <div data-world={world} className="min-h-dvh flex bg-bg">
      <Sidebar world={world} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar world={world} />
        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-6 pb-24 lg:pb-6">
          <div className="mx-auto w-full max-w-[1000px]">{children}</div>
        </main>
      </div>
      <BottomTabBar world={world} />
      <Fab world={world} />
    </div>
  );
}
