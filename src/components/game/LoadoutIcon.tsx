import Image from "next/image";

/**
 * Full-color icons from the approved art, as small transparent PNGs. A traced
 * SVG of this art needs thousands of paths to look right. These stay crisp at
 * 3x density and cost about 3 KB each.
 */
export function LoadoutIcon({
  name,
  className,
}: {
  /** A weapon id, a grenade type or "medkit". */
  name: string;
  className?: string;
}) {
  const file =
    name === "contact" || name === "frag" || name === "stinking"
      ? `grenade-${name}`
      : name;
  return (
    <Image
      className={className}
      src={`/sprites/icons/${file}.png`}
      alt=""
      width={66}
      height={54}
      unoptimized
      loading="eager"
      draggable={false}
    />
  );
}
