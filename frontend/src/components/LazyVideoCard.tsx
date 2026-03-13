import { useState, useEffect, useRef, useCallback } from 'react';

// ── Concurrency-limited thumbnail loader ──
// Only N videos load metadata at a time; the rest queue up.
const MAX_CONCURRENT = 4;
let activeLoads = 0;
const queue: (() => void)[] = [];

function enqueueLoad(start: () => void) {
  if (activeLoads < MAX_CONCURRENT) {
    activeLoads++;
    start();
  } else {
    queue.push(start);
  }
}

function onLoadComplete() {
  activeLoads--;
  if (queue.length > 0) {
    activeLoads++;
    queue.shift()!();
  }
}

interface LazyVideoCardProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
}

// Lazy video thumbnail: shows first-frame thumbnail when scrolled into view
// (concurrency-limited), plays video on hover.
export const LazyVideoCard = ({ src, className, autoPlay }: LazyVideoCardProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [canLoad, setCanLoad] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Step 1: detect when card scrolls into viewport
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

  // Step 2: when visible, enter the concurrency queue
  useEffect(() => {
    if (!isVisible || canLoad) return;
    enqueueLoad(() => setCanLoad(true));
  }, [isVisible, canLoad]);

  // Step 3: when video metadata loads, release the queue slot
  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
    onLoadComplete();
  }, []);

  // Release slot if component unmounts before loading
  useEffect(() => {
    return () => {
      if (canLoad && !isLoaded) onLoadComplete();
    };
  }, [canLoad, isLoaded]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    const video = videoRef.current;
    if (video && !autoPlay) video.play().catch(() => {});
  }, [autoPlay]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
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
      {!isLoaded && (
        <div className={`absolute inset-0 ${canLoad ? 'bg-slate-200 animate-pulse' : 'bg-slate-100'}`} />
      )}
      {canLoad && (
        <video
          ref={videoRef}
          src={`${src}#t=0.5`}
          className={`w-full h-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={handleLoadedData}
          autoPlay={autoPlay || (isHovered && isLoaded) ? true : undefined}
        />
      )}
    </div>
  );
};
