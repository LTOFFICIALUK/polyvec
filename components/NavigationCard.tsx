'use client'

import { useRouter } from 'next/navigation'

interface NavigationCardProps {
  label: string
  href: string
}

const NavigationCard = ({ label, href }: NavigationCardProps) => {
  const router = useRouter()

  const handleClick = () => {
    router.push(href)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Navigate to ${label}`}
      className="w-full bg-gold-primary hover:bg-gold-hover active:bg-gold-dark rounded-xl px-8 py-5 cursor-pointer transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold-hover focus:ring-offset-2 focus:ring-offset-black"
    >
      <div className="text-center">
        <span className="text-white font-bold text-lg tracking-wider uppercase select-none">
          {label}
        </span>
      </div>
    </div>
  )
}

export default NavigationCard

