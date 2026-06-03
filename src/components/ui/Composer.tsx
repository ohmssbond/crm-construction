"use client";

import { ShareToggle } from "./ShareToggle";
import { Button } from "./Button";

export function Composer({ placeholder = "Post an update…" }: { placeholder?: string }) {
  return (
    <div className="bg-surface border border-line rounded-card p-[14px] shadow-card">
      <input
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] py-[9px] outline-none placeholder:text-faint"
      />
      <div className="flex items-center gap-[10px] mt-[10px] border-t border-line-2 pt-[11px]">
        <ShareToggle />
        <Button size="sm" className="ml-auto">
          Post
        </Button>
      </div>
    </div>
  );
}
