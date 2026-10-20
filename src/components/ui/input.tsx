import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils.ts';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
