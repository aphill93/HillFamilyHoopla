"use client";

interface MemberAvatarProps {
  name: string;
  color: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** If true, show the full name tooltip on hover */
  showTooltip?: boolean;
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return (parts[0]?.charAt(0) ?? "?").toUpperCase();
  }
  return (
    (parts[0]?.charAt(0) ?? "") + (parts[parts.length - 1]?.charAt(0) ?? "")
  ).toUpperCase();
}

/**
 * Compute a contrasting text color (black or white) based on the background.
 * Uses the WCAG relative luminance formula.
 */
function contrastColor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.179 ? "#000000" : "#FFFFFF";
}

export default function MemberAvatar({
  name,
  color,
  size = "md",
  showTooltip = true,
  className = "",
}: MemberAvatarProps) {
  const initials = getInitials(name);
  const textColor = contrastColor(color);

  return (
    <span
      className={`
        inline-flex shrink-0 items-center justify-center rounded-full
        font-semibold select-none
        ${SIZE_CLASSES[size]}
        ${className}
      `}
      style={{ backgroundColor: color, color: textColor }}
      title={showTooltip ? name : undefined}
      aria-label={name}
    >
      {initials}
    </span>
  );
}

// ─── Avatar group ─────────────────────────────────────────────────────────────

interface AvatarGroupProps {
  members: Array<{ id: string; name: string; profileColor: string }>;
  max?: number;
  size?: MemberAvatarProps["size"];
}

export function AvatarGroup({ members, max = 5, size = "sm" }: AvatarGroupProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - max;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((member) => (
        <MemberAvatar
          key={member.id}
          name={member.name}
          color={member.profileColor}
          size={size}
          className="ring-2 ring-background"
        />
      ))}
      {overflow > 0 && (
        <span
          className={`
            inline-flex shrink-0 items-center justify-center rounded-full
            bg-muted text-muted-foreground font-semibold ring-2 ring-background
            ${SIZE_CLASSES[size]}
          `}
          title={`+${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
