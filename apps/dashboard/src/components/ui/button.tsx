import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger-outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-canvas font-semibold hover:brightness-105",
  secondary: "bg-[#1f1d15] border border-[#2e2c20] text-cream hover:bg-surface-raised",
  ghost: "bg-transparent border border-border-strong text-muted hover:text-cream",
  "danger-outline":
    "bg-transparent border border-[#34311f] text-danger hover:bg-[#1f1d15]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
