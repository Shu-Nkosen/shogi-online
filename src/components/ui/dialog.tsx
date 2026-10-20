import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils.ts';

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#d7b56a] bg-[#f7edd8] p-6 text-[#2a1c12] shadow-2xl',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 text-[#6b4e32] hover:bg-black/5" aria-label="閉じる">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-4 space-y-2', className)} {...props} />;
}

export function DialogTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className="font-serif text-2xl tracking-wide" {...props} />;
}

export function DialogDescription(props: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className="text-sm leading-relaxed text-[#5c4632]" {...props} />;
}
