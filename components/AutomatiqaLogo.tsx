import React, { useId } from 'react';

interface AutomatiqaLogoProps {
  variant?: 'horizontal' | 'stacked' | 'icon-only';
  className?: string;
  iconClassName?: string;
  inverted?: boolean; // For dark backgrounds
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'custom';
}

/**
 * AutomatiqaInfinityIcon
 * Renders the official AutomatiQA infinity symbol with royal-blue-to-emerald gradient
 * and digital pixel blocks dissolving at the upper right.
 */
export const AutomatiqaInfinityIcon: React.FC<{ 
  className?: string; 
  idPrefix?: string;
  inverted?: boolean;
}> = ({
  className = "w-12 h-7",
  idPrefix,
  inverted = false
}) => {
  const reactId = useId().replace(/:/g, '');
  const prefix = idPrefix || `automa-inf-${reactId}`;
  const gradId = `${prefix}-grad`;
  const maskId = `${prefix}-mask`;

  return (
    <svg
      viewBox="0 0 170 95"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Full continuous loop gradient: Deep Royal Blue -> Bright Blue -> Cyan -> Emerald Green */}
        <linearGradient id={gradId} x1="5%" y1="30%" x2="95%" y2="65%">
          <stop offset="0%" stopColor={inverted ? "#0062FF" : "#003893"} />
          <stop offset="22%" stopColor={inverted ? "#0072FF" : "#005BEA"} />
          <stop offset="45%" stopColor="#0096C7" />
          <stop offset="62%" stopColor="#00B4D8" />
          <stop offset="80%" stopColor="#00C9A7" />
          <stop offset="92%" stopColor="#00D26A" />
          <stop offset="100%" stopColor="#00E676" />
        </linearGradient>

        {/* Clean transparent mask for cutting out the top-right curve segment */}
        <mask id={maskId}>
          <rect x="0" y="0" width="170" height="95" fill="white" />
          <path
            d="M 122 17 C 137 17, 158 27, 158 44"
            stroke="black"
            strokeWidth="19"
            strokeLinecap="square"
            fill="none"
          />
        </mask>
      </defs>

      {/* Main continuous infinity ribbon path */}
      {/* Left loop center (46, 48), Right loop center (124, 48), Crossover (85, 48) */}
      <path
        d="M 85 48 
           C 98 28, 112 16, 126 16 
           C 148 16, 162 30, 162 48 
           C 162 66, 146 80, 126 80 
           C 106 80, 93 64, 85 48 
           C 77 32, 64 16, 44 16 
           C 24 16, 8 30, 8 48 
           C 8 66, 24 80, 44 80 
           C 58 80, 72 68, 85 48 Z"
        stroke={`url(#${gradId})`}
        strokeWidth="14.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={`url(#${maskId})`}
        fill="none"
      />

      {/* Digital Pixel Blocks replacing the top-right curve */}
      <g id="digital-pixels">
        {/* Row 1 (top edge) */}
        <rect x="122" y="10.5" width="7" height="7" rx="1.2" fill="#00C9A7" />
        <rect x="131" y="10.5" width="7" height="7" rx="1.2" fill="#00D26A" />
        <rect x="140" y="10.5" width="7" height="7" rx="1.2" fill="#00E676" />
        <rect x="149" y="10.5" width="7" height="7" rx="1.2" fill="#00D26A" />

        {/* Row 2 (mid curve) */}
        <rect x="122" y="19.5" width="7" height="7" rx="1.2" fill="#00B4D8" />
        <rect x="131" y="19.5" width="7" height="7" rx="1.2" fill="#00C9A7" />
        <rect x="140" y="19.5" width="7" height="7" rx="1.2" fill="#00D26A" />
        <rect x="149" y="19.5" width="7" height="7" rx="1.2" fill="#00E676" />

        {/* Row 3 (inner curve) */}
        <rect x="140" y="28.5" width="7" height="7" rx="1.2" fill="#00C9A7" />
        <rect x="149" y="28.5" width="7" height="7" rx="1.2" fill="#00D26A" />

        {/* Floating outward digital pixels */}
        <rect x="158" y="10.5" width="6.2" height="6.2" rx="1.2" fill="#00E676" />
        <rect x="149" y="1.5" width="6.2" height="6.2" rx="1.2" fill="#00D26A" />
        <rect x="158" y="19.5" width="6.2" height="6.2" rx="1.2" fill="#00C9A7" />
        <rect x="158" y="1.5" width="5.5" height="5.5" rx="1" fill="#00E676" />
        <rect x="166.5" y="10.5" width="5.5" height="5.5" rx="1" fill="#00D26A" />
      </g>
    </svg>
  );
};

export const AutomatiqaLogo: React.FC<AutomatiqaLogoProps> = ({
  variant = 'stacked',
  className = '',
  iconClassName,
  inverted = false,
  showTagline = true,
  size = 'md'
}) => {
  const primaryTextColor = inverted ? 'text-white' : 'text-[#06152D]';
  const taglineTextColor = inverted ? 'text-slate-400' : 'text-[#06152D]';

  if (variant === 'icon-only') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <AutomatiqaInfinityIcon className={iconClassName || "w-10 h-6"} inverted={inverted} />
      </div>
    );
  }

  if (variant === 'stacked') {
    const iconSizes = {
      sm: 'w-11 h-6.5 mb-1',
      md: 'w-14 h-8 mb-1',
      lg: 'w-20 h-11.5 mb-1.5',
      custom: iconClassName || 'w-14 h-8 mb-1'
    };
    const titleSizes = {
      sm: 'text-sm mb-0.5',
      md: 'text-lg mb-0.5',
      lg: 'text-xl mb-1',
      custom: 'text-lg mb-0.5'
    };
    const taglineSizes = {
      sm: 'text-[6px] tracking-[0.2em]',
      md: 'text-[7.5px] tracking-[0.22em]',
      lg: 'text-[9px] tracking-[0.25em]',
      custom: 'text-[7.5px] tracking-[0.22em]'
    };
    const dotSizes = {
      sm: 'w-0.5 h-0.5',
      md: 'w-1 h-1',
      lg: 'w-1.5 h-1.5',
      custom: 'w-1 h-1'
    };

    return (
      <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
        <AutomatiqaInfinityIcon className={iconSizes[size]} inverted={inverted} />
        <div className={`flex items-baseline font-black tracking-tight leading-none ${titleSizes[size]}`}>
          <span className={primaryTextColor}>Automati</span>
          <span className="text-[#00C9A7] bg-gradient-to-r from-[#0096C7] via-[#00C9A7] to-[#00E676] bg-clip-text [-webkit-text-fill-color:transparent]">QA</span>
        </div>
        {showTagline && (
          <div className={`flex items-center gap-1.5 font-bold ${taglineSizes[size]} ${taglineTextColor} uppercase leading-none mt-1 whitespace-nowrap`}>
            <span>FASTER</span>
            <span className={`${dotSizes[size]} rounded-full bg-[#00E676] inline-block shrink-0`} />
            <span>SMARTER</span>
            <span className={`${dotSizes[size]} rounded-full bg-[#00E676] inline-block shrink-0`} />
            <span>RELIABLE</span>
          </div>
        )}
      </div>
    );
  }

  // Default: horizontal variant
  const hIconSizes = {
    sm: 'w-8 h-4.5',
    md: 'w-10 h-6',
    lg: 'w-12 h-7',
    custom: iconClassName || 'w-10 h-6'
  };
  const hTitleSizes = {
    sm: 'text-sm',
    md: 'text-base md:text-lg',
    lg: 'text-xl',
    custom: 'text-base md:text-lg'
  };
  const hTaglineSizes = {
    sm: 'text-[5.5px] tracking-[0.16em]',
    md: 'text-[6.5px] tracking-[0.18em]',
    lg: 'text-[8px] tracking-[0.22em]',
    custom: 'text-[6.5px] tracking-[0.18em]'
  };

  return (
    <div className={`flex items-center gap-2.5 md:gap-3 select-none ${className}`}>
      <div className="flex-shrink-0 flex items-center justify-center">
        <AutomatiqaInfinityIcon className={iconClassName || hIconSizes[size]} inverted={inverted} />
      </div>
      <div className="flex flex-col justify-center">
        <div className={`flex items-baseline font-black tracking-tight leading-none ${hTitleSizes[size]}`}>
          <span className={primaryTextColor}>Automati</span>
          <span className="text-[#00C9A7] bg-gradient-to-r from-[#0096C7] via-[#00C9A7] to-[#00E676] bg-clip-text [-webkit-text-fill-color:transparent]">QA</span>
        </div>
        {showTagline && (
          <div className={`flex items-center gap-1.5 font-bold ${hTaglineSizes[size]} ${taglineTextColor} mt-1 uppercase leading-none opacity-90 whitespace-nowrap`}>
            <span>FASTER</span>
            <span className="w-1 h-1 rounded-full bg-[#00E676] inline-block" />
            <span>SMARTER</span>
            <span className="w-1 h-1 rounded-full bg-[#00E676] inline-block" />
            <span>RELIABLE</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutomatiqaLogo;
