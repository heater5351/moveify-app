import { useState, useEffect } from 'react';

const CallToAction = () => {
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

    const callToActionSection = document.getElementById('call-action');
    if (callToActionSection) {
      observer.observe(callToActionSection);
    }

    return () => {
      if (callToActionSection) {
        observer.unobserve(callToActionSection);
      }
    };
  }, []);

  return (
    <section
      id="call-action"
      className="section-area !bg-primary !text-primary-color"
    >
      <div className="container">
        <div className={`scroll-revealed text-center max-w-[550px] mx-auto ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <h2 className="mb-8 text-inherit">
            Ready to take the first step toward better health?
          </h2>
          <p>
            Our low-cost initial assessment is the perfect opportunity to evaluate your current health status and determine if our exercise physiology services are right for you. There's no obligation to continue with our services after the assessment.
          </p>
          <a
            href="#contact"
            className="inline-block px-5 py-3 rounded-md mt-11 bg-green-400 text-white hover:bg-green-500 hover:text-white focus:bg-green-500 focus:text-white"
            role="button"
          >
            Book Your Assessment Now
          </a>
        </div>
      </div>
    </section>
  );
};

export default CallToAction;