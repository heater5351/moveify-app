import { useState, useEffect } from 'react';

const ContactSection = () => {
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

    const contactSection = document.getElementById('contact');
    if (contactSection) {
      observer.observe(contactSection);
    }

    return () => {
      if (contactSection) {
        observer.unobserve(contactSection);
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Thank you for your message! We will contact you shortly to book your initial assessment.');
  };

  return (
    <section id="contact" className="section-area">
      <div className="container">
        <div className={`scroll-revealed text-center max-w-[550px] mx-auto mb-12 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <h6 className="mb-2 block text-lg font-semibold text-primary">Contact</h6>
          <h2 className="mb-6">Get in Touch</h2>
          <p>
            Ready to start your journey to better health? Contact us today to book your initial assessment.
          </p>
        </div>

        <div className="contact-content grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className={`scroll-revealed ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <h3 className="text-2xl font-bold mb-6 text-primary">Contact Form</h3>
              <form id="contactForm" className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-body-light-12 mb-2">Full Name</label>
                  <input type="text" id="name" name="name" required className="w-full px-4 py-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary"/>
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-body-light-12 mb-2">Email Address</label>
                  <input type="email" id="email" name="email" required className="w-full px-4 py-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary"/>
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-body-light-12 mb-2">Phone Number</label>
                  <input type="tel" id="phone" name="phone" className="w-full px-4 py-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary"/>
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-body-light-12 mb-2">Your Message</label>
                  <textarea id="message" name="message" rows={5} required className="w-full px-4 py-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary"/>
                </div>
                <button type="submit" className="w-full bg-primary text-white py-3 px-6 rounded-md hover:bg-primary-light-5 focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors">Book Initial Assessment</button>
              </form>
            </div>
          </div>
          <div className={`scroll-revealed ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <h3 className="text-2xl font-bold mb-6 text-primary">Clinic Information</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-body-light-12">Address</h4>
                  <p>4 George St, Williamstown VIC 3016</p>
                </div>
                <div>
                  <h4 className="font-semibold text-body-light-12">Phone</h4>
                  <p>0435 524 991</p>
                </div>
                <div>
                  <h4 className="font-semibold text-body-light-12">Email</h4>
                  <p><a href="mailto:ryan@moveifyhealth.com" className="text-primary">ryan@moveifyhealth.com</a></p>
                </div>
                <div>
                  <h4 className="font-semibold text-body-light-12">Hours</h4>
                  <p>Monday - Tuesday: 8:00am - 5:30pm</p>
                </div>
                <div>
                  <h4 className="font-semibold text-body-light-12">Social Media</h4>
                  <div className="flex space-x-4">
                    <a href="#" className="text-primary hover:text-primary-light-5"><i className="lni lni-facebook-fill"></i></a>
                    <a href="#" className="text-primary hover:text-primary-light-5"><i className="lni lni-instagram-original"></i></a>
                    <a href="#" className="text-primary hover:text-primary-light-5"><i className="lni lni-twitter-original"></i></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;