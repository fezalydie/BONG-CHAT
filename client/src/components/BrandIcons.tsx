import type { SVGProps } from 'react';

/**
 * Brand marks drawn inline so the app owns its icons (and their official
 * colours) without depending on a brand-icon package.
 */

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.9h-2.34V22c4.78-.76 8.45-4.92 8.45-9.94Z" />
    </svg>
  );
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.15" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.3" cy="6.7" r="1.25" fill="currentColor" />
    </svg>
  );
}

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2 22l5.36-1.4a9.87 9.87 0 0 0 4.68 1.19h.01c5.43 0 9.84-4.4 9.84-9.84C21.89 6.4 17.48 2 12.04 2Zm5.76 14.06c-.24.68-1.42 1.3-1.96 1.34-.54.05-1.02.24-3.5-.72-2.99-1.18-4.87-4.25-5.02-4.45-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.42.27-.29.58-.36.78-.36.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.58.83 2 .9 2.15.07.14.12.31.02.5-.1.2-.15.32-.29.49-.14.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.29.75 1.24 1.62 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.2.73-.85.93-1.14.19-.29.39-.24.65-.15.27.1 1.7.8 2 .95.29.14.48.22.55.34.07.12.07.7-.17 1.38Z" />
    </svg>
  );
}

export function BongChatLogo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bong-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#bong-gradient)" />
      <path
        d="M32 14c-10.5 0-19 6.9-19 15.4 0 4.9 2.8 9.2 7.2 12-.4 2.4-1.5 4.6-3.2 6.4-.6.6-.2 1.6.6 1.6 4.6-.1 8.3-1.7 10.8-3.4 1.2.2 2.4.3 3.6.3 10.5 0 19-6.9 19-15.4S42.5 14 32 14z"
        fill="#fff"
      />
      <circle cx="24" cy="29" r="2.6" fill="#4f46e5" />
      <circle cx="32" cy="29" r="2.6" fill="#9333ea" />
      <circle cx="40" cy="29" r="2.6" fill="#ec4899" />
    </svg>
  );
}

export const PLATFORM_ICONS = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  whatsapp: WhatsAppIcon,
} as const;
