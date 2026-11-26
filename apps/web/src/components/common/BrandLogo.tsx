import logoWordmark from '@/assets/DataSense Analytics Logo (1).png'
import logoMark from '@/assets/DataSense Analytics Logo Presentation (1).png'

interface BrandLogoProps {
  variant?: 'wordmark' | 'mark'
  className?: string
  alt?: string
}

export function BrandLogo({
  variant = 'wordmark',
  className = '',
  alt = 'DataSense',
}: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src={logoMark}
        alt={alt}
        className={['select-none object-contain', className].filter(Boolean).join(' ')}
      />
    )
  }

  return (
    <img
      src={logoWordmark}
      alt={alt}
      className={['select-none object-contain mix-blend-multiply', className]
        .filter(Boolean)
        .join(' ')}
    />
  )
}
