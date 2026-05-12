import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import moveifyLogo from '../../moveify-logo.png';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Close menu when route changes
    setIsMenuOpen(false);
  }, [location]);

  const scrollToSection = (sectionId: string) => {
    setIsMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className="ic-navbar absolute left-0 top-0 z-40 flex w-full items-center bg-transparent"
      role="banner"
      aria-label="Navigation bar"
    >
      <div className="container">
        <div className="ic-navbar-container relative -mx-5 flex items-center justify-between">
          <div className="w-60 lg:w-56 max-w-full px-5">
            <a
              href="."
              className="ic-navbar-logo block w-full py-5 text-primary-color"
              onClick={() => scrollToSection('home')}
            >
              <img src={moveifyLogo} alt="Moveify Health Solutions Logo" className="h-10" />
            </a>
          </div>

          <div className="flex w-full items-center justify-between px-5">
            <div>
              <button
                type="button"
                className="ic-navbar-toggler absolute right-4 top-1/2 block -translate-y-1/2 rounded-md px-3 py-[6px] text-[22px]/none text-primary-color ring-primary focus:ring-2 lg:hidden"
                data-web-toggle="navbar-collapse"
                data-web-target="navbarMenu"
                aria-expanded={isMenuOpen}
                aria-label="Toggle navigation menu"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <i className="lni lni-menu"></i>
              </button>

              <nav
                id="navbarMenu"
                className={`ic-navbar-collapse absolute right-4 top-[80px] w-full max-w-[250px] rounded-lg hidden bg-primary-light-1 py-5 shadow-lg dark:bg-primary-dark-1 lg:static lg:block lg:w-full lg:max-w-full lg:bg-transparent lg:py-0 lg:shadow-none dark:lg:bg-transparent xl:px-6 ${isMenuOpen ? 'block' : ''}`}
              >
                <ul
                  className="block lg:flex"
                  role="menu"
                  aria-label="Navigation menu"
                >
                  <li className="group relative">
                    <a
                      href="#home"
                      className="ic-page-scroll mx-8 flex py-2 text-base font-medium text-body-light-12 group-hover:text-primary dark:text-body-dark-12 lg:mx-0 lg:inline-flex lg:px-0 lg:py-6 lg:text-primary-color lg:dark:text-primary-color lg:group-hover:text-primary-color lg:group-hover:opacity-70 active"
                      role="menuitem"
                      onClick={() => scrollToSection('home')}
                    >
                      Home
                    </a>
                  </li>

                  <li className="group relative">
                    <a
                      href="#services"
                      className="ic-page-scroll mx-8 flex py-2 text-base font-medium text-body-light-12 group-hover:text-primary dark:text-body-dark-12 lg:mx-0 lg:inline-flex lg:px-0 lg:py-6 lg:text-primary-color lg:dark:text-primary-color lg:group-hover:text-primary-color lg:group-hover:opacity-70"
                      role="menuitem"
                      onClick={() => scrollToSection('services')}
                    >
                      Services
                    </a>
                  </li>

                  <li className="group relative">
                    <a
                      href="#about"
                      className="ic-page-scroll mx-8 flex py-2 text-base font-medium text-body-light-12 group-hover:text-primary dark:text-body-dark-12 lg:mx-0 lg:inline-flex lg:px-0 lg:py-6 lg:text-primary-color lg:dark:text-primary-color lg:group-hover:text-primary-color lg:group-hover:opacity-70"
                      role="menuitem"
                      onClick={() => scrollToSection('about')}
                    >
                      About
                    </a>
                  </li>

                  <li className="group relative">
                    <a
                      href="#contact"
                      className="ic-page-scroll mx-8 flex py-2 text-base font-medium text-body-light-12 group-hover:text-primary dark:text-body-dark-12 lg:mx-0 lg:inline-flex lg:px-0 lg:py-6 lg:text-primary-color lg:dark:text-primary-color lg:group-hover:text-primary-color lg:group-hover:opacity-70"
                      role="menuitem"
                      onClick={() => scrollToSection('contact')}
                    >
                      Contact
                    </a>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="flex items-center justify-end pr-[52px] lg:pr-0">
              <div className="hidden sm:flex">
                <a
                  href="#contact"
                  className="btn-navbar ml-5 px-6 py-3 rounded-md bg-primary-color bg-opacity-20 text-base font-medium text-primary-color hover:bg-opacity-100 hover:text-primary"
                  role="button"
                  onClick={() => scrollToSection('contact')}
                >
                  Book Assessment
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;