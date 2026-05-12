import { useState, useEffect } from 'react';
import moveifyLogo from '../../moveify-logo.png';

const Footer = () => {
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

    const footer = document.querySelector('footer');
    if (footer) {
      observer.observe(footer);
    }

    return () => {
      if (footer) {
        observer.unobserve(footer);
      }
    };
  }, []);

  return (
    <footer className="bg-primary-dark text-white py-12">
      <div className="container">
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div>
            <h4 className="text-lg font-bold mb-4">Moveify Health Solutions</h4>
            <p className="text-primary-light-10">Exercise Physiology for a Healthier You</p>
            <div className="mt-6">
              <img src={moveifyLogo} alt="Moveify Health Solutions Logo" className="h-8" />
            </div>
          </div>
          <div>
            <h4 className="text-lg font-bold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><a href="#home" className="text-primary-light-10 hover:text-white">Home</a></li>
              <li><a href="#services" className="text-primary-light-10 hover:text-white">Services</a></li>
              <li><a href="#about" className="text-primary-light-10 hover:text-white">About</a></li>
              <li><a href="#contact" className="text-primary-light-10 hover:text-white">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-bold mb-4">Contact Info</h4>
            <address className="not-italic">
              <p>4 George St<br>Williamstown VIC 3016</p>
              <p>0435 524 991</p>
              <p><a href="mailto:ryan@moveifyhealth.com" className="text-primary-light-10 hover:text-white">ryan@moveifyhealth.com</a></p>
            </address>
          </div>
          <div>
            <h4 className="text-lg font-bold mb-4">Opening Hours</h4>
            <p className="text-primary-light-10">Monday - Tuesday: 8:00am - 5:30pm</p>
          </div>
        </div>
        <div className="border-t border-primary-light-10 pt-8 text-center">
          <p className="text-primary-light-10">© 2026 Moveify Health Solutions. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;