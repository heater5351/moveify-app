import { useState, useEffect } from 'react';

const AssessmentSection = () => {
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

    const assessmentSection = document.getElementById('assessment');
    if (assessmentSection) {
      observer.observe(assessmentSection);
    }

    return () => {
      if (assessmentSection) {
        observer.unobserve(assessmentSection);
      }
    };
  }, []);

  return (
    <section id="assessment" className="section-area bg-primary-light-1">
      <div className="container">
        <div className={`scroll-revealed text-center max-w-[550px] mx-auto mb-12 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <h6 className="mb-2 block text-lg font-semibold text-primary">Get Started</h6>
          <h2 className="mb-6">Your Path to Better Health</h2>
          <p>
            Begin your journey with our low-cost initial assessment to evaluate your current health status and determine if our services are right for you.
          </p>
        </div>

        <div className="assessment-content grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className={`scroll-revealed ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <h3 className="text-2xl font-bold mb-6 text-primary">Initial Assessment</h3>
              <p className="mb-6">
                Our low-cost initial assessment provides an opportunity to:
              </p>
              <ul className="list-disc pl-6 mb-6 space-y-2">
                <li>Assess your current fitness level and health status</li>
                <li>Identify any specific health concerns or limitations</li>
                <li>Discuss your personal health and fitness goals</li>
                <li>Develop a preliminary treatment plan</li>
                <li>Determine if our exercise physiology services will meet your needs</li>
              </ul>
              <p>
                This assessment is an investment in your health and an opportunity to see if our personalized approach is the right fit for you. There's no obligation to continue with our services after the assessment.
              </p>
            </div>
          </div>
          <div className={`scroll-revealed ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <img
              src="https://images.unsplash.com/photo-1576671914505-47a84084e212?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80"
              alt="Health Assessment"
              className="rounded-xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default AssessmentSection;