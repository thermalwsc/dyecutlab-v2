/* Bold-outline icon set for the landing page. One style everywhere:
   2.5px black stroke, round joins, lime (#b8f02a) used as the only fill
   accent. Keep new icons on the same 48×48 grid. */

type IconProps = { className?: string };

const LIME = "var(--dcl-lime)";
const INK = "currentColor";

function Svg({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke={INK}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/* ---------- Trust row ---------- */

export function BoltIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M27 4 10 27h12l-3 17 19-25H26Z" fill={LIME} />
    </Svg>
  );
}

export function FactoryIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 42V22l10 6v-6l10 6v-6l10 6V10h7v32Z" fill={LIME} />
      <path d="M12 42v-6h5v6M24 42v-6h5v6" />
      <path d="M37 6c1-3 5-3 5 0" strokeWidth={2} />
    </Svg>
  );
}

export function DiamondIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 8h20l9 11-19 22L5 19Z" fill={LIME} />
      <path d="M5 19h38M18 8l-4 11 10 22M30 8l4 11-10 22M14 19l10-11 10 11" />
    </Svg>
  );
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="24" cy="24" r="18" fill="#fff" />
      <path d="M6 24h36M24 6c-7 8-7 28 0 36M24 6c7 8 7 28 0 36M9 14h30M9 34h30" />
    </Svg>
  );
}

/* ---------- UI glyphs ---------- */

export function CubeLogo({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M24 4 42 14v20L24 44 6 34V14Z" strokeWidth={4} />
      <path d="M6 14l18 10 18-10M24 24v20" strokeWidth={4} />
    </Svg>
  );
}

export function ChatDotsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        d="M24 6C13 6 5 13 5 22c0 5 3 10 7 13l-2 8 9-5c2 .5 3 .6 5 .6 11 0 19-7 19-16.6S35 6 24 6Z"
        fill="currentColor"
      />
      <circle cx="15.5" cy="22" r="3" fill={LIME} />
      <circle cx="24" cy="22" r="3" fill={LIME} />
      <circle cx="32.5" cy="22" r="3" fill={LIME} />
    </svg>
  );
}

export function ArrowIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 12h15M13 5l7 7-7 7" />
    </svg>
  );
}

/* Phone with a lime chat bubble — "Join Our Beta" panel. */
export function PhoneChatIllustration({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="22" y="14" width="50" height="92" rx="9" transform="rotate(-10 47 60)" fill="#fff" />
      <path d="M58 44h40a12 12 0 0 1 12 12v8a12 12 0 0 1-12 12H74l-12 10 2-10a12 12 0 0 1-10-12v-8a12 12 0 0 1 4-8Z" fill={LIME} />
      <circle cx="72" cy="60" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="84" cy="60" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="96" cy="60" r="3.5" fill="currentColor" stroke="none" />
      <path d="M94 22l4-9M104 28l9-4M84 16l0-8" strokeWidth={3} />
    </svg>
  );
}

/* Phone with an "SMS" bubble on black — "Need Packaging Now?" panel. */
export function PhoneSmsIllustration({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="#fff"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="30" y="12" width="48" height="94" rx="9" transform="rotate(10 54 59)" />
      <path d="M46 96h14" transform="rotate(10 54 59)" />
      <path d="M62 42h34a12 12 0 0 1 12 12v4a12 12 0 0 1-12 12H80l-10 9 1-9h-9a12 12 0 0 1-12-12v-4a12 12 0 0 1 12-12Z" fill={LIME} stroke={LIME} />
      <text x="79" y="62" textAnchor="middle" fill="#0a0a0a" stroke="none" fontSize="16" fontWeight="900" fontFamily="inherit">
        SMS
      </text>
      <path d="M12 42l10 6M8 60h12M12 78l10-6M110 26l-6 8" stroke={LIME} />
    </svg>
  );
}

/* Padlock-with-bag outline, top-left of the black panel. */
export function BagLockIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke={LIME}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M16 18v-5a8 8 0 0 1 16 0v5" />
      <rect x="7" y="18" width="34" height="24" rx="5" />
      <path d="M18 28l6 6 6-6" />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.6 3c.4 2.3 1.9 3.9 4.4 4.1v3.1c-1.6 0-3-.5-4.3-1.3v6.6c0 3.6-2.7 6.1-6.1 6.1A6 6 0 0 1 4.5 15.5c0-3.7 3.2-6.5 7-5.9v3.3c-1.9-.5-3.8.8-3.8 2.7 0 1.6 1.2 2.8 2.8 2.8 1.7 0 2.8-1.2 2.8-3.1V3Z" />
    </svg>
  );
}

/* ---------- "How it works" steps (outline only, drawn on black) ---------- */

export function StepPhoneIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="10" y="4" width="22" height="40" rx="5" />
      <path d="M18 38h6" />
      <path d="M26 14h14a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-6l-5 4 1-4h-4a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Z" fill={LIME} stroke={LIME} />
      <circle cx="29" cy="21" r="1.4" fill="#0a0a0a" stroke="none" />
      <circle cx="34" cy="21" r="1.4" fill="#0a0a0a" stroke="none" />
      <circle cx="39" cy="21" r="1.4" fill="#0a0a0a" stroke="none" />
    </Svg>
  );
}

export function StepChatIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 8h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-9 8 1-8H8a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z" />
      <circle cx="16" cy="21" r="2" fill={LIME} stroke="none" />
      <circle cx="24" cy="21" r="2" fill={LIME} stroke="none" />
      <circle cx="32" cy="21" r="2" fill={LIME} stroke="none" />
    </Svg>
  );
}

export function StepProofIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10 4h20l8 8v32H10Z" />
      <path d="M30 4v8h8" />
      <path d="M24 17l8 4.5v9L24 35l-8-4.5v-9Z" />
      <path d="M16 21.5l8 4.5 8-4.5M24 26v9" />
    </Svg>
  );
}

export function LaptopIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="8" y="9" width="32" height="22" rx="3" />
      <path d="M3 37h42l-3 4H6Z" />
    </Svg>
  );
}

/* "Why DYE CUT LAB?" tiles: bolder line (3.5) with a lime accent on each. */
export function ThoughtIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M14 32c-5 0-8-3-8-7s3-7 7-7c1-5 5-8 10-8 6 0 10 4 10 9 4 0 7 3 7 7s-3 6-7 6H14Z"
        strokeWidth={3.5}
        fill="#fff"
      />
      <circle cx="16" cy="38.5" r="2.8" strokeWidth={3} fill={LIME} />
      <circle cx="10.5" cy="43.5" r="1.6" strokeWidth={2.5} fill={LIME} />
      <path d="M20 25h.01M26 25h.01M32 25h.01" strokeWidth={5} />
    </Svg>
  );
}

export function PuzzleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 18h8a4 4 0 1 1 8 0h8v8a4 4 0 1 1 0 8v8H8V34a4 4 0 1 0 0-8Z" fill={LIME} strokeWidth={3.5} />
    </Svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 24C9 14 16 10 24 10s15 4 21 14c-6 10-13 14-21 14S9 34 3 24Z" strokeWidth={3.5} fill="#fff" />
      <circle cx="24" cy="24" r="7.5" strokeWidth={3.5} fill={LIME} />
      <circle cx="24" cy="24" r="2.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* Box with a lime lid. */
export function CubeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M24 4 42 14 24 24 6 14Z" fill={LIME} strokeWidth={3.5} />
      <path d="M6 14v20l18 10 18-10V14M24 24v20" strokeWidth={3.5} />
    </Svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* ---------- Doodle accents ---------- */

/* Three short motion lines fanning out — place next to key words. */
export function Burst({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 20 2 24M12 12l-1-9M20 14l8-6" />
    </svg>
  );
}

export function Sparkle({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 1c.6 5.5 2.5 8.4 11 11-8.5 2.6-10.4 5.5-11 11-.6-5.5-2.5-8.4-11-11 8.5-2.6 10.4-5.5 11-11Z" />
    </svg>
  );
}
