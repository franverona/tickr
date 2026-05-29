interface LogoProps {
  size?: number
}

export default function Logo({ size = 20 }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#2563eb" />
      <path
        d="M7 17L12 22.5L25 9.5"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
