import {
  Building2,
  GraduationCap,
  Landmark,
  MapPin,
  TrainFront,
  type LucideIcon,
} from "lucide-react";

/**
 * Boards store an icon name rather than an asset path, so adding a board is a
 * data change rather than a code change.
 */
const ICONS: Record<string, LucideIcon> = {
  Landmark,
  TrainFront,
  Building2,
  MapPin,
  GraduationCap,
};

export function BoardIcon({
  icon,
  color,
  size = 40,
}: {
  icon?: string | null;
  color?: string | null;
  size?: number;
}) {
  const Icon = (icon && ICONS[icon]) || Landmark;
  const tint = color ?? "#4F46E5";

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: `${tint}15`,
        color: tint,
      }}
    >
      <Icon size={size * 0.5} strokeWidth={2.2} />
    </span>
  );
}
