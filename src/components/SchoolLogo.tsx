import React from 'react';

interface SchoolLogoProps {
  className?: string;
  onClick?: () => void;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({ className = "w-10 h-10", onClick }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 600 600" 
      className={`${className} cursor-pointer select-none transition-transform active:scale-95`}
      onClick={onClick}
      role="img"
      aria-label="상일미디어고등학교 로고"
    >
      <defs>
        <path id="sl-top-arc" d="M 70,300 A 235,235 0 1,1 530,300" fill="none" />
        <path id="sl-bottom-arc" d="M 530,300 A 235,235 0 0,1 70,300" fill="none" />
      </defs>

      {/* Outer Navy Ring */}
      <path 
        d="M 300,10 A 290,290 0 1,0 300,590 A 290,290 0 1,0 300,10 Z M 300,75 A 225,225 0 1,1 300,525 A 225,225 0 1,1 300,75 Z" 
        fill="#15325b" 
      />

      {/* Thin White Concentric Accent Lines */}
      <circle cx="300" cy="300" r="285" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      <circle cx="300" cy="300" r="230" fill="none" stroke="#ffffff" strokeWidth="3" />

      {/* Left & Right White Spacer Dots */}
      <circle cx="38" cy="256" r="12" fill="#ffffff" />
      <circle cx="562" cy="256" r="12" fill="#ffffff" />

      {/* Foundation Name (Top Arc) */}
      <text fill="#ffffff" fontFamily="'Batang', 'Gungsuh', 'Noto Serif KR', 'Nanum Myeongjo', serif" fontWeight="900" fontSize="28" letterSpacing="9px">
        <textPath href="#sl-top-arc" startOffset="50%" textAnchor="middle">
          학 교 법 인   육 하 학 원
        </textPath>
      </text>

      {/* School Name (Bottom Arc) */}
      <text fill="#ffffff" fontFamily="'Batang', 'Gungsuh', 'Noto Serif KR', 'Nanum Myeongjo', serif" fontWeight="900" fontSize="30" letterSpacing="10px">
        <textPath href="#sl-bottom-arc" startOffset="50%" textAnchor="middle">
          상 일 미 디 어 고 등 학 교
        </textPath>
      </text>

      {/* Center Shield Body */}
      <path d="M 172,135 Q 235,125 294,116 L 294,234 L 172,336 Z" fill="#15325b" />
      <path d="M 306,116 Q 365,125 428,135 L 428,336 L 306,234 Z" fill="#15325b" />
      <path d="M 172,348 L 300,246 L 428,348 L 428,355 L 300,512 L 172,355 Z" fill="#15325b" />

      {/* Upper Left Quadrant: White Stylized Roses */}
      <g transform="translate(190, 155) scale(0.95)">
        <path d="M 52,25 C 45,15 30,15 22,25 C 15,35 22,50 35,52 C 48,50 55,35 52,25 Z" fill="#ffffff" />
        <circle cx="35" cy="35" r="14" fill="#ffffff" />
        <circle cx="35" cy="35" r="9" fill="#15325b" />
        <circle cx="16" cy="62" r="10" fill="#ffffff" />
        <circle cx="16" cy="62" r="6" fill="#15325b" />
        <circle cx="38" cy="80" r="13" fill="#ffffff" />
        <circle cx="38" cy="80" r="8" fill="#15325b" />
        <path d="M 12,38 Q 4,40 10,48 Q 18,48 16,42 Z" fill="#ffffff" />
        <path d="M 52,55 Q 60,60 55,68 Q 48,68 49,60 Z" fill="#ffffff" />
        <path d="M 22,78 Q 15,85 20,92 Q 28,90 26,82 Z" fill="#ffffff" />
        <path d="M 50,85 Q 58,88 56,96 Q 48,96 46,88 Z" fill="#ffffff" />
      </g>

      {/* Upper Right Quadrant: Truth Worth Faith */}
      <g fill="#ffffff" fontFamily="'Times New Roman', Times, 'Nanum Myeongjo', serif" textAnchor="middle">
        <text x="367" y="180" fontSize="26" fontWeight="bold" letterSpacing="1px">Truth</text>
        <text x="367" y="218" fontSize="26" fontWeight="bold" letterSpacing="1px">Worth</text>
        <text x="367" y="256" fontSize="26" fontWeight="bold" letterSpacing="1px">Faith</text>
      </g>

      {/* Lower Section: 1984 */}
      <text x="300" y="292" fill="#ffffff" fontFamily="'Times New Roman', Times, serif" fontSize="22" fontWeight="bold" textAnchor="middle" letterSpacing="1.5px">
        1984
      </text>

      {/* Open Book Waves & Center Spine */}
      <path d="M 176,358 Q 240,305 294,395 L 294,408 Q 240,320 176,372 Z" fill="#ffffff" />
      <path d="M 424,358 Q 360,305 306,395 L 306,408 Q 360,320 424,372 Z" fill="#ffffff" />
      <path d="M 182,388 Q 245,340 294,435 L 294,448 Q 245,355 182,402 Z" fill="#ffffff" />
      <path d="M 418,388 Q 355,340 306,435 L 306,448 Q 355,355 418,402 Z" fill="#ffffff" />
      <path d="M 198,426 Q 252,385 294,475 L 294,488 Q 252,400 198,440 Z" fill="#ffffff" />
      <path d="M 402,426 Q 348,385 306,475 L 306,488 Q 348,400 402,440 Z" fill="#ffffff" />
      <path d="M 295,395 L 305,395 L 305,502 L 295,502 Z" fill="#ffffff" />
    </svg>
  );
};
