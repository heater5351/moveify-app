import { useState, useEffect, useRef, useCallback } from 'react';

interface LazyVideoCardProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
}

// Derives thumbnail URL from video URL: adds .jpg suffix
// Bump version param when thumbnails are regenerated to bust browser cache
export function getThumbnailUrl(videoUrl: string): string {
  return `${videoUrl}.jpg?v=8`;
}

// Lazy video card: shows a static .jpg thumbnail instantly, loads video on hover.
// Thumbnail stays visible until the video is actually playing — no white flash.
export const LazyVideoCard = ({ src, className, autoPlay }: LazyVideoCardProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbRetry, setThumbRetry] = useState(0);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const thumbFailed = thumbRetry > 3;

  // Reset thumbnail state if this card is reused for a different video
  useEffect(() => {
    setThumbRetry(0);
    setThumbLoaded(false);
  }, [src]);

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

  const handlePlaying = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setIsPlaying(false);
    const video = videoRef.current;
    if (video && !autoPlay) { video.pause(); video.currentTime = 0; }
  }, [autoPlay]);

  // Start playback once video can play and is hovered
  const handleCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (video && !autoPlay) video.play().catch(() => {});
  }, [autoPlay]);

  const thumbnailUrl = getThumbnailUrl(src);

  return (
    <div
      ref={containerRef}
      className={className || "absolute inset-0"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Static thumbnail — stays visible until video is actually playing */}
      {isVisible && !thumbFailed && (
        <img
          key={thumbRetry}
          src={thumbRetry === 0 ? thumbnailUrl : `${thumbnailUrl}&r=${thumbRetry}`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: isPlaying ? 0 : 1, transition: 'opacity 100ms' }}
          decoding="async"
          onLoad={() => setThumbLoaded(true)}
          onError={() => {
            const next = thumbRetry + 1;
            if (next <= 3) {
              // Exponential-ish backoff: 0.5s, 1s, 2s — survives brief network bursts
              setTimeout(() => setThumbRetry(next), 500 * Math.pow(2, next - 1));
            } else {
              setThumbRetry(next); // mark as permanently failed
            }
          }}
        />
      )}

      {/* Skeleton while not yet visible, still loading, or failed all retries */}
      {(!isVisible || !thumbLoaded) && !isPlaying && (
        <div className="absolute inset-0 bg-slate-200 animate-pulse" />
      )}

      {/* Video — only mounts on hover (or autoPlay), hidden until playing */}
      {(isHovered || autoPlay) && (
        <video
          ref={videoRef}
          src={`${src}#t=0.5`}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: isPlaying ? 1 : 0, transition: 'opacity 100ms' }}
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={handleCanPlay}
          onPlaying={handlePlaying}
          autoPlay={autoPlay}
        />
      )}
    </div>
  );
};
