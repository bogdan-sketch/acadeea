/**
 * Marcaj de prioritate task: același triunghi pentru toate nivelurile,
 * diferențiat prin culoare (1 albastru → 5 roșu, aceeași scară ca iOS
 * `PriorityBadge.swift` / PriorityPicker) ȘI prin cifra nivelului desenată
 * în interiorul triunghiului, ca P1–P5 să se citească dintr-o privire.
 * Prioritatea 0 (sau lipsă) nu randează nimic.
 *
 * Culorile sunt paleta de sistem iOS, fixe intenționat (paritate 1:1 cu
 * aplicația nativă) — sunt culori de STATUS, nu de brand, deci nu trec
 * prin --primary / tokenii de accent.
 */
const PRIORITY_COLORS: Record<number, string> = {
  1: '#007AFF', // albastru
  2: '#34C759', // verde
  3: '#FFCC00', // galben
  4: '#FF9500', // portocaliu
  5: '#FF3B30', // roșu
};

export function PriorityBadge({
  priority,
  size = 21,
  className,
}: {
  priority: number | null | undefined;
  /** Latura pătratului SVG, px — destul de mare ca cifra să fie lizibilă. */
  size?: number;
  className?: string;
}) {
  if (!priority || priority < 1) return null;
  const level = Math.min(priority, 5);
  const fill = PRIORITY_COLORS[level];
  // Galbenul e prea deschis pentru o cifră albă (la fel ca pe iOS).
  const digit = level === 3 ? '#1c1c1e' : '#ffffff';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`Prioritate ${level}`}
      className={`inline-block shrink-0 align-[-4px] ${className ?? ''}`}
    >
      {/* Triunghi cu colțuri rotunjite: fill + stroke în aceeași culoare. */}
      <path
        d="M12 3.6 L22 20.4 H2 Z"
        fill={fill}
        stroke={fill}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* Centrul optic al unui triunghi e sub cel geometric — cifra stă
          spre bază. */}
      <text
        x="12"
        y="18.4"
        textAnchor="middle"
        fontSize="10.5"
        fontWeight="800"
        fill={digit}
        style={{ fontFamily: 'inherit' }}
      >
        {level}
      </text>
    </svg>
  );
}
