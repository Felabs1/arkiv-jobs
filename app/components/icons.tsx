/** Minimal stroke icons (24px grid), sized by font-size via 1em. */
import type { ReactNode, SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const IconGrid = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);
export const IconPulse = (p: P) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </Icon>
);
export const IconChart = (p: P) => (
  <Icon {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="m7 15 4-4 3 3 5-6" />
  </Icon>
);
export const IconBars = (p: P) => (
  <Icon {...p}>
    <path d="M6 20v-6M12 20V8M18 20v-10" />
  </Icon>
);
export const IconScan = (p: P) => (
  <Icon {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10" />
  </Icon>
);
export const IconSparkles = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.1l-1.8-5.5-5.7-1.8L10.2 9z" />
    <path d="M19 3v3M17.5 4.5h3" />
  </Icon>
);
export const IconCpu = (p: P) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
    <path d="M9.5 9.5h5v5h-5zM9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" />
  </Icon>
);
export const IconBlocks = (p: P) => (
  <Icon {...p}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </Icon>
);
export const IconUsers = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.2a5.5 5.5 0 0 1 2.5 4.8" />
  </Icon>
);
export const IconTasks = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    <path d="M8 8.5h8M8 12h8M8 15.5h5" />
  </Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const IconX = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const IconBell = (p: P) => (
  <Icon {...p}>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);
export const IconWallet = (p: P) => (
  <Icon {...p}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <rect x="4" y="8" width="16" height="11" rx="2.5" />
    <circle cx="16" cy="13.5" r="1.2" />
  </Icon>
);
export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconArrowUpRight = (p: P) => (
  <Icon {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Icon>
);
export const IconTrophy = (p: P) => (
  <Icon {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" />
  </Icon>
);
export const IconGauge = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="m12 13 3.5-4" />
  </Icon>
);
export const IconBolt = (p: P) => (
  <Icon {...p}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />
  </Icon>
);
export const IconLayers = (p: P) => (
  <Icon {...p}>
    <path d="m12 4 8.5 4.5L12 13 3.5 8.5z" />
    <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
  </Icon>
);
export const IconLogo = (p: P) => (
  <svg width="1em" height="1em" viewBox="0 0 32 32" aria-hidden="true" {...p}>
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8be9ff" />
        <stop offset="1" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="15" fill="url(#lg)" opacity=".18" />
    <circle cx="11" cy="11" r="3.4" fill="url(#lg)" />
    <circle cx="21" cy="11" r="3.4" fill="#e8f7ff" />
    <circle cx="11" cy="21" r="3.4" fill="#e8f7ff" />
    <circle cx="21" cy="21" r="3.4" fill="url(#lg)" />
    <circle cx="16" cy="16" r="2" fill="#bdf3ff" />
  </svg>
);
