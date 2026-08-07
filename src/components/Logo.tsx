import clsx from "clsx";

/**
 * Xamvaad brand marks.
 *
 * The mark is the supplied artwork (public/logo-mark.png) rather than
 * something drawn here — it is the real logo, and a hand-redrawn
 * approximation of a brand mark is worse than a raster of the genuine one.
 * The same file backs the tab icon, so every surface shows one identical
 * mark. Swap that file and the whole app follows.
 *
 * The artwork ships on its own dark plate, so it reads as an app icon on
 * light and dark backgrounds alike; only the corner radius changes by
 * context.
 */

const LOGO_SRC = "/logo-mark.png";
/** The same artwork lifted off its dark plate, for use over any background. */
const GLYPH_SRC = "/logo-glyph.png";

/**
 * The mark. Used beside the wordmark on auth screens and in the top bar.
 */
export function LogoMark({
  size = 32,
  radius,
  className,
}: {
  size?: number;
  /** Corner radius in px. Defaults to the icon-standard ~22% of the box. */
  radius?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="Xamvaad"
      width={size}
      height={size}
      // shrink-0 matters: without it the mark collapses to a sliver when it
      // sits next to a long label in a tight flex row.
      className={clsx("shrink-0 object-cover", className)}
      style={{ width: size, height: size, borderRadius: radius ?? size * 0.22 }}
    />
  );
}

/**
 * The same mark as a small solid object — the admin avatar, the official
 * account's avatar. Kept as its own export so those call sites read as what
 * they are.
 */
export function LogoTile({
  size = 36,
  radius,
  className,
}: {
  size?: number;
  radius?: number;
  className?: string;
}) {
  return <LogoMark size={size} radius={radius} className={className} />;
}

/**
 * XAMVAAD, drawn rather than typeset.
 *
 * The A is a bare Λ with no crossbar, which no system font will give us.
 * Drawing it also means the letterforms are identical on every machine
 * instead of at the mercy of the font stack.
 *
 * Sized in `em` and stroked in `currentColor`, so callers control it with
 * ordinary text classes.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 192 32"
      fill="none"
      role="img"
      aria-label="Xamvaad"
      className={clsx("inline-block w-auto align-[-0.15em]", className)}
      style={{ height: "1em" }}
    >
      <g
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
      >
        {/* X */}
        <path d="M2 4 L20 28 M20 4 L2 28" />
        {/* Λ */}
        <path d="M30 28 L39 4 L48 28" />
        {/* M */}
        <path d="M58 28 L58 4 L67 20 L76 4 L76 28" />
        {/* V */}
        <path d="M86 4 L95 28 L104 4" />
        {/* Λ */}
        <path d="M114 28 L123 4 L132 28" />
        {/* Λ */}
        <path d="M142 28 L151 4 L160 28" />
        {/* D — one closed path rather than a stem plus a bowl. Drawn as two
            overlapping subpaths it notched visibly at the corners once the
            stroke got heavier, because butt caps met at an angle there. */}
        <path d="M170 28 L170 4 L176 4 A12 12 0 0 1 176 28 Z" />
      </g>
    </svg>
  );
}

/**
 * The brand poster — mark, wordmark and tagline on the dark plate.
 *
 * This is the whole masthead for the screens a person meets before they have
 * an account. It replaces the old arrangement of a small mark beside a
 * heading, which read as two competing titles fighting for the same space.
 *
 * The glyph is used rather than the plated mark so there is no seam where its
 * square met the panel.
 */
export function BrandBanner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-2xl bg-[#080a18] px-6 py-9",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={GLYPH_SRC}
        alt=""
        className="h-[4.5rem] w-auto"
        width={390}
        height={282}
      />
      <Wordmark className="mt-5 text-[1.6rem] text-white" />
      <span className="mt-2.5 bg-gradient-to-r from-[#3b82f6] to-[#a855f7] bg-clip-text text-[0.8rem] font-medium tracking-[0.01em] text-transparent">
        Where Aspirants Discuss
      </span>
    </div>
  );
}
