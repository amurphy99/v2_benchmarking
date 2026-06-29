import { ButtonHTMLAttributes, ReactNode } from "react";

export type AdminButtonVariant = "primary" | "ghost" | "danger" | "subtle" | "outline";
export type AdminButtonSize    = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant ?: AdminButtonVariant;
    size    ?: AdminButtonSize;
    iconLeft ?: ReactNode;
    iconRight?: ReactNode;
}

function variantClasses(v: AdminButtonVariant): string {
    switch (v) {
        case "primary": return "bg-admin-accent text-white hover:bg-admin-accent2 border border-admin-accent";
        case "danger" : return "bg-status-error text-white hover:opacity-90 border border-status-error";
        case "ghost"  : return "bg-transparent text-admin-text hover:bg-admin-muted border border-transparent";
        case "outline": return "bg-admin-panel text-admin-text hover:bg-admin-muted border border-admin-border";
        case "subtle":
        default       : return "bg-admin-muted text-admin-text hover:bg-admin-border border border-admin-border";
    }
}

function sizeClasses(s: AdminButtonSize): string {
    return s === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
}

export function AdminButton({
    variant = "subtle",
    size = "md",
    iconLeft,
    iconRight,
    children,
    className = "",
    disabled,
    ...rest
}: Props) {
    const disabledCls = disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer";
    return (
        <button
            {...rest}
            disabled  = {disabled}
            className = {`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${variantClasses(variant)} ${sizeClasses(size)} ${disabledCls} ${className}`}
        >
            {iconLeft}
            {children}
            {iconRight}
        </button>
    );
}
