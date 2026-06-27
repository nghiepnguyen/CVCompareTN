import { useState } from 'react';
import type { ReactNode } from 'react';

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  children: ReactNode; // fallback icon element
}

export function UserAvatar({ src, alt = '', imgClassName, fallbackClassName, children }: UserAvatarProps) {
  const [errored, setErrored] = useState(false);

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={alt}
        className={imgClassName}
        onError={() => setErrored(true)}
      />
    );
  }

  return <div className={fallbackClassName}>{children}</div>;
}
