import { Search } from "lucide-react";

export function SearchField({
  placeholder = "Search…",
  value,
  onChange,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-[9px] bg-surface border border-line rounded-[10px] px-[13px] py-[9px] w-full max-w-[360px]">
      <Search size={16} className="text-faint shrink-0" />
      <input
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
      />
    </div>
  );
}
