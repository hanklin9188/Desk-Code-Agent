import React, { type SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  logo: <><path d="M8 3.5 3.5 6v5L8 13.5l4.5-2.5V6L8 3.5Z"/><path d="m5.5 7.3 2.5 1.4 2.5-1.4M8 8.7v2.8"/></>,
  files: <><path d="M2.5 4.5h4l1.2 1.4h5.8v7.6h-11z"/><path d="M2.5 7h11"/></>,
  overview: <><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5 6h6M5 9h4"/></>,
  architecture: <><rect x="6" y="2" width="4" height="3" rx="1"/><rect x="2" y="11" width="4" height="3" rx="1"/><rect x="10" y="11" width="4" height="3" rx="1"/><path d="M8 5v3M4 11V8h8v3"/></>,
  flow: <><circle cx="4" cy="4" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="4" cy="12" r="2"/><path d="m6 4 4.1 3M10.1 9 6 12"/></>,
  code: <path d="m5.5 4-4 4 4 4M10.5 4l4 4-4 4M9 2.5 7 13.5"/>,
  diff: <><path d="M5 2.5v11M11 2.5v3a2 2 0 0 1-2 2H5M11 13.5v-3a2 2 0 0 0-2-2H5"/><path d="M3 4h4M5 2v4M9 12h4"/></>,
  verify: <><path d="m3 8 3 3 7-7"/><circle cx="8" cy="8" r="6"/></>,
  report: <><path d="M3 2.5h7l3 3v8H3z"/><path d="M10 2.5v3h3M5 8h6M5 10.5h4"/></>,
  history: <><circle cx="8" cy="8" r="5.5"/><path d="M8 4.5V8l2.5 1.5M2.5 4v3h3"/></>,
  settings: <><circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1"/></>,
  search: <><circle cx="7" cy="7" r="4"/><path d="m10 10 3.5 3.5"/></>,
  chevron: <path d="m6 3.5 4.5 4.5L6 12.5"/>,
  branch: <><circle cx="5" cy="3.5" r="1.5"/><circle cx="11" cy="4.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><path d="M5 5v6M10 5.5C10 8 5 7 5 10"/></>,
  shield: <path d="M8 2 13 4v3.7c0 3-2.1 5.3-5 6.3-2.9-1-5-3.3-5-6.3V4z"/>,
  stop: <rect x="4" y="4" width="8" height="8" rx="1"/>,
  play: <path d="m5 3 8 5-8 5z"/>,
  more: <><circle cx="3" cy="8" r=".7" fill="currentColor"/><circle cx="8" cy="8" r=".7" fill="currentColor"/><circle cx="13" cy="8" r=".7" fill="currentColor"/></>,
  close: <path d="m4 4 8 8M12 4l-8 8"/>
};

export function Icon({ name, size = 16, ...props }: SVGProps<SVGSVGElement> & { name: string; size?: number }) {
  return <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
