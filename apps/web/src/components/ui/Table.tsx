import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

export function TableContainer({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`w-full overflow-x-auto rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs ${className}`}
    >
      {children}
    </div>
  )
}

export function Table({ children, className = '', ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`w-full border-collapse text-left text-[13px] ${className}`} {...props}>
      {children}
    </table>
  )
}

export function TableHead({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <thead className={`border-b border-ds-border bg-ds-surface2 ${className}`}>{children}</thead>
  )
}

export function TableBody({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <tbody className={`divide-y divide-ds-border-subtle ${className}`}>{children}</tbody>
}

export function TableRow({
  children,
  interactive = false,
  className = '',
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={[
        interactive ? 'transition-colors hover:bg-ds-surface2' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TableHeaderCell({
  children,
  className = '',
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-ds-secondary ${className}`}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableCell({
  children,
  className = '',
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-ds-ink align-middle ${className}`} {...props}>
      {children}
    </td>
  )
}
