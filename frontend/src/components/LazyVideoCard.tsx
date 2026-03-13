import { useState, useEffect, useRef, useCallback } from 'react';

// Lazy-loaded video thumbnail — only loads video when card is visible in viewport
export const LazyVideoCard = ({ src, className }: { src: string; className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleMouseEnter = useCallback(() => {
    const video = videoRef.current;
    if (video) video.play().catch(() => {});
  }, []);

  const handleMouseLeave = useCallback(() => {
    const video = videoRef.current;
    if (video) { video.pause(); video.currentTime = 0; }
  }, []);

  return (
    <div
      ref={containerRef}
      className={className || "absolute inset-0"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isVisible && (
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          preload="metadata"
        />
      )}
    </div>
  );
};
