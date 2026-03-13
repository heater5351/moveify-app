import { useState, useEffect, useRef, useCallback } from 'react';

interface LazyVideoCardProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  /**
   * 'visible' — loads video metadata when scrolled into view (good for small lists)
   * 'hover' — only loads video on hover, shows static placeholder (good for large grids)
   */
  loadStrategy?: 'visible' | 'hover';
}

// Lazy-loaded video thumbnail with two strategies:
// - 'visible': loads metadata when in viewport (for small lists like ProgramView, PatientPortal)
// - 'hover': loads nothing until hovered (for large grids like ExerciseLibrary)
export const LazyVideoCard = ({ src, className, autoPlay, loadStrategy = 'visible' }: LazyVideoCardProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // For 'visible' strategy: observe intersection
  useEffect(() => {
    if (loadStrategy !== 'visible') return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadStrategy]);

  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    // For 'visible' strategy, play on hover
    if (loadStrategy === 'visible') {
      const video = videoRef.current;
      if (video && !autoPlay) video.play().catch(() => {});
    }
  }, [autoPlay, loadStrategy]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (loadStrategy === 'visible') {
      const video = videoRef.current;
      if (video && !autoPlay) { video.pause(); video.currentTime = 0; }
    }
  }, [autoPlay, loadStrategy]);

  // For hover strategy: play/pause when video loads
  useEffect(() => {
    if (loadStrategy !== 'hover') return;
    const video = videoRef.current;
    if (!video || !isLoaded) return;
    if (isHovered) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isHovered, isLoaded, loadStrategy]);

  const shouldRenderVideo = loadStrategy === 'visible' ? isVisible : isHovered;

  return (
    <div
      ref={containerRef}
      className={className || "absolute inset-0"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Placeholder / skeleton */}
      {!isLoaded && (
        <div className={`absolute inset-0 ${shouldRenderVideo ? 'bg-slate-200 animate-pulse' : 'bg-slate-100'}`} />
      )}
      {shouldRenderVideo && (
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
