import React from 'react';

interface SchoolLogoProps {
  className?: string;
  onClick?: () => void;
  alt?: string;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({ 
  className = "w-14 h-14", 
  onClick,
  alt = "상일미디어고등학교 로고"
}) => {
  return (
    <img
      src="/logo.png"
      alt={alt}
      className={`${className} cursor-pointer select-none transition-transform active:scale-95 object-contain`}
      onClick={onClick}
      referrerPolicy="no-referrer"
      loading="eager"
      decoding="async"
    />
  );
};

