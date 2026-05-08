import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#F4C430] text-white hover:bg-[#D4A017]",
        destructive:
          "bg-red-500 text-white hover:bg-red-600",
        outline:
          "border border-[var(--border-color)] bg-transparent hover:bg-[var(--bg-muted)] text-[var(--text-primary)]",
        secondary:
          "bg-[var(--bg-muted)] text-[var(--text-primary)] hover:bg-[var(--border-color)]",
        ghost: "hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
        link: "text-[#F4C430] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
