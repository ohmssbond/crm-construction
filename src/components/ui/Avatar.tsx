export function Avatar({ initials }: { initials: string }) {
  return (
    <div className="size-[38px] rounded-full bg-[#d4dae3] text-[#475467] grid place-items-center text-[13px] font-bold shrink-0">
      {initials}
    </div>
  );
}
