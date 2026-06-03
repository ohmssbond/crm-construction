import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
};

export function Button({ variant = "primary", size = "md", className = "", ...p }: Props) {
  const base =
    "inline-flex items-center gap-[7px] font-semibold rounded-control border cursor-pointer";
  const v =
    variant === "ghost"
      ? "bg-surface text-text border-line"
      : "bg-accent text-white border-accent";
  const s =
    size === "sm" ? "text-[12px] px-[11px] py-[6px]" : "text-[13px] px-[15px] py-[9px]";
  return <button className={`${base} ${v} ${s} ${className}`} {...p} />;
}
