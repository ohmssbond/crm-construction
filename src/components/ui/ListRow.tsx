import type { ReactNode } from "react";
import Link from "next/link";

type Props = {
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  meta?: ReactNode;
  href?: string;
};

function Inner({ leading, title, sub, meta }: Props) {
  return (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="text-body font-semibold truncate">{title}</div>
        {sub && <div className="text-[12px] text-muted mt-0.5 truncate">{sub}</div>}
      </div>
      {meta && <div className="text-meta text-faint text-right shrink-0">{meta}</div>}
    </>
  );
}

const rowCls =
  "flex items-center gap-[13px] px-4 py-[13px] border-b border-line-2 last:border-b-0";

export function ListRow(props: Props) {
  if (props.href) {
    return (
      <Link href={props.href} className={`${rowCls} hover:bg-line-2`}>
        <Inner {...props} />
      </Link>
    );
  }
  return (
    <div className={rowCls}>
      <Inner {...props} />
    </div>
  );
}
