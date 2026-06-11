import { cn } from "@/lib/cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-amber-400 text-zinc-950 hover:bg-amber-300 active:bg-amber-400/90",
        variant === "ghost" &&
          "bg-white/[0.04] text-zinc-200 ring-1 ring-inset ring-white/10 hover:bg-white/[0.08]",
        className,
      )}
      {...props}
    />
  );
}
