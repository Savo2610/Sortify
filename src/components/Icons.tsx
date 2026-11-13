import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const make =
  (path: React.ReactNode, fill = false) =>
  ({ size = 20, ...rest }: P) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );

export const IconCheck = make(<path d="M20 6 9 17l-5-5" />);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconX = make(<path d="M18 6 6 18M6 6l12 12" />);
export const IconArrowLeft = make(<path d="M19 12H5M12 19l-7-7 7-7" />);
export const IconArrowRight = make(<path d="M5 12h14M12 5l7 7-7 7" />);
export const IconUndo = make(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </>,
);
export const IconSkip = make(
  <>
    <path d="m5 4 10 8-10 8V4z" />
    <path d="M19 5v14" />
  </>,
);
export const IconTrash = make(
  <>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </>,
);
export const IconMove = make(
  <>
    <path d="M14 5h6v6" />
    <path d="M20 5 9 16" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </>,
);
export const IconHeart = make(
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
);
export const IconHeartFill = make(
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  true,
);
export const IconMusic = make(
  <>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </>,
);
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const IconExternal = make(
  <>
    <path d="M15 3h6v6M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </>,
);
export const IconLogout = make(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>,
);
export const IconSettings = make(
  <>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </>,
);
export const IconPlay = make(<path d="M7 4v16l13-8z" />, true);
export const IconShuffle = make(
  <>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </>,
);
export const IconBan = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.7 5.7 12.6 12.6" />
  </>,
);
export const IconTarget = make(
  <>
    <path d="M21 15V6M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 12H3M16 6H3M12 18H3" />
  </>,
);
export const IconSparkle = make(
  <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
);
export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const IconKeyboard = make(
  <>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
  </>,
);
