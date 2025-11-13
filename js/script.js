/* ===========================
   SECTION-SCOPED GALLERY MODAL
   =========================== */
class SectionGallery {
  constructor() {
    this.modal = document.getElementById('galleryModal');
    this.modalImage = document.getElementById('galleryModalImage');
    this.modalVideo = document.getElementById('galleryModalVideo');
    this.modalTitle = document.getElementById('galleryModalTitle');
    this.closeBtn = this.modal.querySelector('.gallery-modal-close');
    this.prevBtn = document.getElementById('galleryPrev');
    this.nextBtn = document.getElementById('galleryNext');

    this.currentSectionItems = [];
    this.currentIndex = 0;

    this.init();
  }

  init() {
    // Attach click for each gallery item
    document.querySelectorAll('.result-gallery .gallery-item').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.closest('.result-category');
        if (!section) return;

        this.currentSectionItems = Array.from(section.querySelectorAll('.gallery-item'));
        this.currentIndex = this.currentSectionItems.indexOf(item);

        this.openModal();
      });
    });

    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.closeModal());
    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());
    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());
    if (this.modal) this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.modal.classList.contains('show')) return;
      if (e.key === 'Escape') this.closeModal();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });
  }

  openModal() {
    const item = this.currentSectionItems[this.currentIndex];
    const img = item.querySelector('img');
    const video = item.querySelector('video');

    this.modalImage.style.display = 'none';
    this.modalVideo.style.display = 'none';

    if (video) {
      this.modalVideo.innerHTML = '';
      const source = document.createElement('source');
      source.src = video.querySelector('source')?.src || video.src;
      source.type = 'video/mp4';
      this.modalVideo.appendChild(source);
      this.modalVideo.style.display = 'block';
      this.modalVideo.load();
      this.modalVideo.play().catch(() => {});
      this.modalTitle.textContent = video.getAttribute('alt') || 'Video';
    } else if (img) {
      this.modalImage.src = img.src;
      this.modalImage.alt = img.alt;
      this.modalImage.style.display = 'block';
      this.modalTitle.textContent = img.getAttribute('alt') || '';
    }

    this.modal.style.display = 'flex';
    setTimeout(() => this.modal.classList.add('show'), 10);

    this.updateNav();
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    this.modal.classList.remove('show');
    document.body.style.overflow = 'auto';

    if (this.modalVideo.style.display === 'block') {
      this.modalVideo.pause();
      this.modalVideo.currentTime = 0;
      this.modalVideo.innerHTML = '';
    }

    setTimeout(() => {
      this.modal.style.display = 'none';
    }, 300);
  }

  prev() {
    if (this.currentIndex <= 0) return;
    this.currentIndex--;
    this.openModal();
  }

  next() {
    if (this.currentIndex >= this.currentSectionItems.length - 1) return;
    this.currentIndex++;
    this.openModal();
  }

  updateNav() {
    this.prevBtn.style.display = this.currentIndex <= 0 ? 'none' : 'block';
    this.nextBtn.style.display = this.currentIndex >= this.currentSectionItems.length - 1 ? 'none' : 'block';
  }
}

/* ===========================
   SMOOTH SCROLL & NAVBAR
   =========================== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  if (window.scrollY > 100) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
});

/* ===========================
   INTERSECTION OBSERVER
   =========================== */
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('animate-in');
  });
}, observerOptions);

document.addEventListener('DOMContentLoaded', () => {
  const elementsToAnimate = document.querySelectorAll('section, .section-title, .result-category, .skill-item');
  elementsToAnimate.forEach(el => observer.observe(el));

  new SectionGallery(); // Initialize gallery after DOM loaded
});

/* ===========================
   PROJECT TOGGLE
   =========================== */
function toggleProject(button) {
  const card = button.closest('.project-card');
  const content = card.querySelector('.project-content');
  if (content.classList.contains('expanded')) {
    content.classList.remove('expanded');
    button.textContent = button.getAttribute('data-en') || 'View Details ↓';
  } else {
    content.classList.add('expanded');
    button.textContent = button.getAttribute('data-en')?.replace('View Details ↓','Hide Details ↑') || 'Hide Details ↑';
  }
}

/* ===========================
   LANGUAGE TOGGLE
   =========================== */
let currentLanguage = 'en';
function toggleLanguage() {
  currentLanguage = currentLanguage === 'en' ? 'fr' : 'en';
  const elements = document.querySelectorAll('[data-en][data-fr]');
  elements.forEach(el => {
    const text = el.getAttribute(`data-${currentLanguage}`);
    if (text) el.textContent = text;
  });

  const langToggle = document.getElementById('langToggle');
  if (!langToggle) return;
  const langFlag = langToggle.querySelector('.lang-flag');
  const langText = langToggle.querySelector('.lang-text');
  if (currentLanguage === 'fr') { langFlag.textContent = '🇺🇸'; langText.textContent = 'EN'; }
  else { langFlag.textContent = '🇫🇷'; langText.textContent = 'FR'; }
}
