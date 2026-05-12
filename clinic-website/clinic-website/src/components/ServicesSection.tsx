import { useState, useEffect } from 'react';

const ServicesSection = () => {
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

    const servicesSection = document.getElementById('services');
    if (servicesSection) {
      observer.observe(servicesSection);
    }

    return () => {
      if (servicesSection) {
        observer.unobserve(servicesSection);
      }
    };
  }, []);

  const services = [
    {
      icon: 'lni-heart',
      title: 'Chronic Disease Management',
      description: 'Personalized exercise programs for managing conditions like diabetes, cardiovascular disease, metabolic syndrome, and more. Our programs are designed to improve your health outcomes and quality of life.'
    },
    {
      icon: 'lni-bone',
      title: 'Post-Rehabilitation',
      description: 'Exercise programs to help you recover from injuries and surgeries, restoring strength, mobility, and function. Our evidence-based approach ensures safe and effective rehabilitation.'
    },
    {
      icon: 'lni-scale',
      title: 'Weight Management',
      description: 'Sustainable exercise and nutrition strategies to help you achieve and maintain a healthy weight. Our programs focus on long-term lifestyle changes for lasting results.'
    },
    {
      icon: 'lni-run',
      title: 'Sports Performance',
      description: 'Specialized training programs to enhance athletic performance and prevent injuries. Whether you\'re a weekend warrior or a professional athlete, we can help you reach your goals.'
    },
    {
      icon: 'lni-users',
      title: 'Corporate Wellness',
      description: 'Workplace health programs to improve employee well-being and reduce workplace injuries. We design customized programs for your team\'s specific needs.'
    },
    {
      icon: 'lni-user',
      title: 'Senior Fitness',
      description: 'Exercise programs designed to maintain mobility, strength, and independence for older adults. Our gentle yet effective approach helps seniors stay active and healthy.'
    }
  ];

  return (
    <section id="services" className="section-area">
      <div className="container">
        <div className={`scroll-revealed text-center max-w-[550px] mx-auto mb-12 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <h6 className="mb-2 block text-lg font-semibold text-primary">Services</h6>
          <h2 className="mb-6">Our Exercise Physiology Services</h2>
          <p>
            Comprehensive programs designed to improve your health and well-being through personalized exercise solutions.
          </p>
        </div>

        <div className="row">
          {services.map((service, index) => (
            <div key={index} className={`scroll-revealed col-12 sm:col-6 lg:col-4 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
              <div className="group hover:-translate-y-1">
                <div
                  className="w-[70px] h-[70px] rounded-2xl mb-6 flex items-center justify-center text-[37px]/none bg-primary text-primary-color"
                >
                  <i className={service.icon}></i>
                </div>
                <div className="w-full">
                  <h4 className="text-[1.25rem]/tight font-semibold mb-5">{service.title}</h4>
                  <p>{service.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;