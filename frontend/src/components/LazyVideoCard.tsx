import { useState, useEffect, useRef, useCallback } from 'react';

interface LazyVideoCardProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
}

// Derives thumbnail URL from video URL: adds .jpg suffix
function getThumbnailUrl(videoUrl: string): string {
  return `${videoUrl}.jpg`;
}

// Lazy video card: shows a static .jpg thumbnail instantly, loads video on hover.
export const LazyVideoCard = ({ src, className, autoPlay }: LazyVideoCardProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  // Observe intersection for lazy thumbnail loading
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

  const handleVideoReady = useCallback(() => {
    setVideoReady(true);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (autoPlay) return;
    const video = videoRef.current;
    if (video && videoReady) video.play().catch(() => {});
  }, [autoPlay, videoReady]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (autoPlay) return;
    const video = videoRef.current;
    if (video) { video.pause(); video.currentTime = 0; }
  }, [autoPlay]);

  // Auto-play once video is ready if hovered while loading
  useEffect(() => {
    if (isHovered && videoReady && !autoPlay) {
      const video = videoRef.current;
      if (video) video.play().catch(() => {});
    }
  }, [videoReady, isHovered, autoPlay]);

  const thumbnailUrl = getThumbnailUrl(src);

  return (
    <div
      ref={containerRef}
      className={className || "absolute inset-0"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Static thumbnail image — loads fast, shown until video plays */}
      {isVisible && !thumbError && (
        <img
          src={thumbnailUrl}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover ${isHovered && videoReady ? 'opacity-0' : 'opacity-100'}`}
          loading="lazy"
          onError={() => setThumbError(true)}
        />
      )}

      {/* Fallback skeleton if no thumbnail */}
      {(!isVisible || thumbError) && !videoReady && (
        <div className="absolute inset-0 bg-slate-200 animate-pulse" />
      )}

      {/* Video — only mounts on hover (or autoPlay) to avoid mass loading */}
      {(isHovered || autoPlay) && (
        <video
          ref={videoRef}
          src={`${src}#t=0.5`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={handleVideoReady}
          autoPlay={autoPlay}
        />
      )}
    </div>
  );
};
