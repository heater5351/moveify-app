import { useState, useEffect, useRef, useCallback } from 'react';

// Lazy-loaded video thumbnail — only loads video when card is visible in viewport
// Shows a loading skeleton until the first frame is available
export const LazyVideoCard = ({ src, className, autoPlay }: { src: string; className?: string; autoPlay?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleMouseEnter = useCallback(() => {
    const video = videoRef.current;
    if (video && !autoPlay) video.play().catch(() => {});
  }, [autoPlay]);

  const handleMouseLeave = useCallback(() => {
    const video = videoRef.current;
    if (video && !autoPlay) { video.pause(); video.currentTime = 0; }
  }, [autoPlay]);

  return (
    <div
      ref={containerRef}
      className={className || "absolute inset-0"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Skeleton pulse while loading */}
      {(!isVisible || !isLoaded) && (
        <div className="absolute inset-0 bg-slate-200 animate-pulse" />
      )}
      {isVisible && (
        <video
          ref={videoRef}
          src={`${src}#t=0.5`}
          className={`w-full h-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={handleLoadedData}
          autoPlay={autoPlay}
        />
      )}
    </div>
  );
};
