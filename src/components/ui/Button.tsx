import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";
type Size = "md" | "sm";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

/** Button styling, exported so a Link can be rendered to look like a button. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = "") {
  const base =
    "inline-flex items-center gap-[7px] font-semibold rounded-control border cursor-pointer";
  const v =
    variant === "ghost"
      ? "bg-surface text-text border-line"
      : "bg-accent text-white border-accent";
  const s =
    size === "sm" ? "text-[12px] px-[11px] py-[6px]" : "text-[13px] px-[15px] py-[9px]";
  return `${base} ${v} ${s} ${className}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...p }: Props) {
  return <button className={buttonClasses(variant, size, className)} {...p} />;
}
