import type { CSSProperties, ReactNode } from "react";
import type { World } from "./nav";
import { Sidebar, type Brand, type ShellUser } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { Fab } from "./Fab";

/**
 * The one shell for both worlds. `world` sets `data-world` and the nav set;
 * `accent` is the tenant's brand color (org.primary_color), applied as the
 * `--accent` CSS variable on the root so the whole tree themes from it.
 * `brand`/`user` are the signed-in org + identity for the sidebar; when
 * omitted the Sidebar falls back to placeholder values.
 */
export default function AppShell({
  world,
  accent,
  brand,
  user,
  clientNoun,
  showTimeLink,
  children,
}: {
  world: World;
  accent?: string;
  brand?: Brand;
  user?: ShellUser;
  clientNoun?: string;
  showTimeLink?: boolean;
  children: ReactNode;
}) {
  // Theme the subtree from the tenant's brand color. We must override the
  // *resolved* theme tokens (`--color-accent[-soft]`), not just `--accent`:
  // globals.css declares `--color-accent: var(--accent)` at :root, so that
  // var() resolves once at :root (the green fallback) and the green value is
  // then inherited — overriding `--accent` lower down comes too late. Setting
  // the color tokens here re-bases every `*-accent` utility for the subtree.
  // `--accent` is still set for the few consumers that read it directly.
  const soft = accent
    ? `color-mix(in srgb, ${accent} 14%, #fff)`
    : undefined;
  // Cast: CSS custom properties aren't in the CSSProperties type.
  const style = accent
    ? ({
        "--accent": accent,
        "--accent-soft": soft,
        "--color-accent": accent,
        "--color-accent-soft": soft,
      } as CSSProperties)
    : undefined;
  return (
    <div data-world={world} style={style} className="min-h-dvh flex bg-bg">
      <Sidebar world={world} brand={brand} user={user} clientNoun={clientNoun} showTimeLink={showTimeLink} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar world={world} clientNoun={clientNoun} />
        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-6 pb-24 lg:pb-6">
          <div className="mx-auto w-full max-w-[1000px]">{children}</div>
        </main>
      </div>
      <BottomTabBar world={world} />
      <Fab world={world} />
    </div>
  );
}
