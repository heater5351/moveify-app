import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import AboutSection from './components/AboutSection';
import ServicesSection from './components/ServicesSection';
import AssessmentSection from './components/AssessmentSection';
import ContactSection from './components/ContactSection';
import Footer from './components/Footer';
import './tailwind.css';

const App = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading state
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Router>
      <div className="relative">
        {/* Loading overlay */}
        {isLoading && (
          <div className="page-loading fixed top-0 bottom-0 left-0 right-0 z-[99999] flex items-center justify-center bg-primary-light-1 dark:bg-primary-dark-1 opacity-100 visible pointer-events-auto" role="status" aria-live="polite" aria-atomic="true" aria-label="Loading...">
            <div className="grid-loader">
              {[...Array(9)].map((_, i) => (
                <div key={i}></div>
              ))}
            </div>
          </div>
        )}

        <Navbar />

        <main className="main relative">
          <HeroSection />
          <AboutSection />
          <ServicesSection />
          <AssessmentSection />
          <ContactSection />
        </main>

        <Footer />
      </div>
    </Router>
  );
};

export default App;