import { useState, useEffect } from 'react';
import moveifyLogo from '../../moveify-logo.png';

const HeroSection = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    const heroSection = document.getElementById('home');
    if (heroSection) {
      observer.observe(heroSection);
    }

    return () => {
      if (heroSection) {
        observer.unobserve(heroSection);
      }
    };
  }, []);

  return (
    <section
      id="home"
      className="relative overflow-hidden bg-primary text-primary-color pt-[120px] md:pt-[130px] lg:pt-[160px]"
    >
      <div className="container">
        <div className="-mx-5 flex flex-wrap items-center">
          <div className="w-full px-5">
            <div className={`scroll-revealed mx-auto max-w-[780px] text-center ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
              <h1
                className="mb-6 text-3xl font-bold leading-snug text-primary-color sm:text-4xl sm:leading-snug lg:text-5xl lg:leading-tight"
              >
                Personalized Exercise Physiology
                <span className="block">for Your Health Journey</span>
              </h1>

              <p
                className="mx-auto mb-9 max-w-[600px] text-base text-primary-color sm:text-lg sm:leading-normal"
              >
                At Moveify Health Solutions, we provide evidence-based exercise physiology services tailored to your unique needs. Our expert team works with you to create personalized treatment plans for chronic disease management, post-rehabilitation, weight management, and more.
              </p>

              <ul
                className="mb-10 flex flex-wrap items-center justify-center gap-4 md:gap-5"
              >
                <li>
                  <a
                    href="#contact"
                    className="inline-flex items-center justify-center rounded-md bg-primary-color text-primary px-5 py-3 text-center text-base font-medium shadow-md hover:bg-primary-light-5 md:px-7 md:py-[14px]"
                    role="button"
                  >
                    Book Initial Assessment
                  </a>
                </li>
              </ul>

              <div>
                <p className="mb-4 text-center text-primary-color">Evidence-Based Solutions</p>

                <div
                  className={`scroll-revealed flex items-center justify-center gap-4 text-center ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                >
                  <a
                    href="https://www.moveifyapp.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-color/60 hover:text-primary-color"
                  >
                    <img src={moveifyLogo} alt="Moveify App" className="h-8" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full px-5">
            <div className={`scroll-revealed relative z-10 mx-auto max-w-[845px] ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
              <figure className="mt-16">
                <img
                  src="https://images.unsplash.com/photo-1571019614245-c6805633f46a?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
                  alt="Exercise Physiology Session"
                  className="mx-auto max-w-full rounded-t-xl rounded-tr-xl"
                />
              </figure>

              <div className="absolute -left-9 bottom-0 z-[-1]">
                <img
                  src="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80"
                  alt=""
                  className="w-[120px] opacity-75 rounded-full"
                />
              </div>

              <div className="absolute -right-6 -top-6 z-[-1]">
                <img
                  src="https://images.unsplash.com/photo-1576671914505-47a84084e212?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80"
                  alt=""
                  className="w-[120px] opacity-75 rounded-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;