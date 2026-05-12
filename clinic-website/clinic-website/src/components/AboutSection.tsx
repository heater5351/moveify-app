import { useState, useEffect } from 'react';

const AboutSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

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

    const aboutSection = document.getElementById('about');
    if (aboutSection) {
      observer.observe(aboutSection);
    }

    return () => {
      if (aboutSection) {
        observer.unobserve(aboutSection);
      }
    };
  }, []);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
  };

  return (
    <section id="about" className="section-area bg-primary-light-1">
      <div className="container">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2">
          <div className="w-full">
            <figure className={`scroll-revealed max-w-[480px] mx-auto ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
              <img
                src="https://images.unsplash.com/photo-1571019614245-c6805633f46a?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80"
                alt="Exercise Physiology Session"
                className="rounded-xl"
              />
            </figure>
          </div>

          <div className="w-full">
            <div className={`scroll-revealed ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
              <h6 className="mb-2 block text-lg font-semibold text-primary">About Us</h6>
              <h2 className="mb-6">Your Trusted Exercise Physiology Partner</h2>
            </div>

            <div className={`tabs scroll-revealed ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
              <nav
                className="tabs-nav flex flex-wrap gap-4 my-8"
                role="tablist"
                aria-label="About us tabs"
              >
                <button
                  type="button"
                  className={`tabs-link inline-block py-2 px-4 rounded-md text-body-light-12 dark:text-body-dark-12 bg-body-light-12/10 dark:bg-body-dark-12/10 text-inherit font-medium hover:bg-primary hover:text-primary-color focus:bg-primary focus:text-primary-color ${activeTab === 'profile' ? 'active' : ''}`}
                  data-web-toggle="tabs"
                  data-web-target="tabs-panel-profile"
                  id="tabs-list-profile"
                  role="tab"
                  aria-controls="tabs-panel-profile"
                  onClick={() => handleTabChange('profile')}
                >
                  Our Approach
                </button>

                <button
                  type="button"
                  className={`tabs-link inline-block py-2 px-4 rounded-md text-body-light-12 dark:text-body-dark-12 bg-body-light-12/10 dark:bg-body-dark-12/10 text-inherit font-medium hover:bg-primary hover:text-primary-color focus:bg-primary focus:text-primary-color ${activeTab === 'vision' ? 'active' : ''}`}
                  data-web-toggle="tabs"
                  data-web-target="tabs-panel-vision"
                  id="tabs-list-vision"
                  role="tab"
                  aria-controls="tabs-panel-vision"
                  onClick={() => handleTabChange('vision')}
                >
                  Our Team
                </button>

                <button
                  type="button"
                  className={`tabs-link inline-block py-2 px-4 rounded-md text-body-light-12 dark:text-body-dark-12 bg-body-light-12/10 dark:bg-body-dark-12/10 text-inherit font-medium hover:bg-primary hover:text-primary-color focus:bg-primary focus:text-primary-color ${activeTab === 'history' ? 'active' : ''}`}
                  data-web-toggle="tabs"
                  data-web-target="tabs-panel-history"
                  id="tabs-list-history"
                  role="tab"
                  aria-controls="tabs-panel-history"
                  onClick={() => handleTabChange('history')}
                >
                  Our Philosophy
                </button>
              </nav>

              <div
                className={`tabs-content mt-4 ${activeTab === 'profile' ? 'block' : 'hidden'}`}
                id="tabs-panel-profile"
                tabindex="-1"
                role="tabpanel"
                aria-labelledby="tabs-list-profile"
              >
                <p>
                  Moveify Health Solutions is an exercise physiology clinic located in Williamstown, providing personalized exercise programs for individuals of all ages and fitness levels. Our team of accredited exercise physiologists works with you to develop tailored treatment plans that address your specific health goals and needs.
                </p>
                <p>
                  With a focus on evidence-based practice, we combine the latest research with practical, real-world solutions to help you improve your health, manage chronic conditions, and enhance your overall well-being.
                </p>
              </div>

              <div
                className={`tabs-content mt-4 ${activeTab === 'vision' ? 'block' : 'hidden'}`}
                id="tabs-panel-vision"
                tabindex="-1"
                role="tabpanel"
                aria-labelledby="tabs-list-vision"
              >
                <p>
                  Our team consists of experienced exercise physiologists with diverse backgrounds in sports science, rehabilitation, and chronic disease management. Each member brings unique expertise to ensure you receive comprehensive care tailored to your individual needs.
                </p>
                <p>
                  We believe in a collaborative approach, working closely with you to understand your goals, challenges, and lifestyle. Our clinic is equipped with state-of-the-art facilities to support your rehabilitation and fitness journey.
                </p>
              </div>

              <div
                className={`tabs-content mt-4 ${activeTab === 'history' ? 'block' : 'hidden'}`}
                id="tabs-panel-history"
                tabindex="-1"
                role="tabpanel"
                aria-labelledby="tabs-list-history"
              >
                <p>
                  At Moveify Health Solutions, we believe that exercise is medicine. Our philosophy is centered on helping you achieve sustainable health improvements through personalized exercise programs that fit seamlessly into your lifestyle.
                </p>
                <p>
                  We focus on creating positive, long-lasting changes by combining exercise prescription with education and lifestyle modification. Our goal is to empower you to take control of your health and maintain your progress beyond your time with us.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;