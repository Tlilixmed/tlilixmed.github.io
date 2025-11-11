/* ===========================
   NEW GALLERY JAVASCRIPT
   =========================== */

class GalleryManager {
  constructor() {
    this.modal = null;
    this.modalImage = null;
    this.modalTitle = null;
    this.closeBtn = null;
    this.prevBtn = null;
    this.nextBtn = null;
    this.currentImages = [];
    this.currentIndex = 0;
    
    this.init();
  }
  
  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }
  
  setup() {
    // Get modal elements
    this.modal = document.getElementById('galleryModal');
    this.modalImage = document.getElementById('galleryModalImage');
    this.modalTitle = document.getElementById('galleryModalTitle');
    this.closeBtn = document.querySelector('.gallery-modal-close');
    this.prevBtn = document.getElementById('galleryPrev');
    this.nextBtn = document.getElementById('galleryNext');
    
    if (!this.modal || !this.modalImage) {
      console.error('Gallery modal elements not found');
      return;
    }
    
    // Collect all gallery images
    this.collectImages();
    
    // Add event listeners
    this.addEventListeners();
    
    console.log('Gallery Manager initialized with', this.currentImages.length, 'images');
  }
  
  collectImages() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    this.currentImages = [];
    
    galleryItems.forEach((item, index) => {
      const img = item.querySelector('img');
      if (img) {
        const imageData = {
          src: img.src,
          alt: img.alt,
          title: img.getAttribute('data-title') || img.alt,
          element: item,
          index: index
        };
        this.currentImages.push(imageData);
        
        // Add click listener to gallery item
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openModal(index);
        });
        
        // Add cursor pointer
        item.style.cursor = 'pointer';
      }
    });
  }
  
  addEventListeners() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeModal());
    }
    
    // Navigation buttons
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.previousImage());
    }
    
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.nextImage());
    }
    
    // Modal background click
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.closeModal();
        }
      });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (this.modal && this.modal.classList.contains('show')) {
        switch(e.key) {
          case 'Escape':
            this.closeModal();
            break;
          case 'ArrowLeft':
            this.previousImage();
            break;
          case 'ArrowRight':
            this.nextImage();
            break;
        }
      }
    });
  }
  
  openModal(index) {
    if (index < 0 || index >= this.currentImages.length) {
      console.error('Invalid image index:', index);
      return;
    }
    
    this.currentIndex = index;
    const imageData = this.currentImages[index];
    
    console.log('Opening modal for image:', imageData.title);
    
    // Set image and title
    this.modalImage.src = imageData.src;
    this.modalImage.alt = imageData.alt;
    
    if (this.modalTitle) {
      this.modalTitle.textContent = imageData.title;
    }
    
    // Show modal
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Add show class with slight delay for animation
    setTimeout(() => {
      this.modal.classList.add('show');
    }, 10);
    
    // Update navigation buttons
    this.updateNavigation();
  }
  
  closeModal() {
    if (!this.modal) return;
    
    console.log('Closing gallery modal');
    
    this.modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    
    // Hide modal after animation
    setTimeout(() => {
      this.modal.style.display = 'none';
    }, 300);
  }
  
  previousImage() {
    if (this.currentImages.length <= 1) return;
    
    this.currentIndex = (this.currentIndex - 1 + this.currentImages.length) % this.currentImages.length;
    this.updateModalContent();
  }
  
  nextImage() {
    if (this.currentImages.length <= 1) return;
    
    this.currentIndex = (this.currentIndex + 1) % this.currentImages.length;
    this.updateModalContent();
  }
  
  updateModalContent() {
    const imageData = this.currentImages[this.currentIndex];
    
    // Fade out
    this.modalImage.style.opacity = '0';
    
    setTimeout(() => {
      // Update content
      this.modalImage.src = imageData.src;
      this.modalImage.alt = imageData.alt;
      
      if (this.modalTitle) {
        this.modalTitle.textContent = imageData.title;
      }
      
      // Fade in
      this.modalImage.style.opacity = '1';
      
      this.updateNavigation();
    }, 150);
  }
  
  updateNavigation() {
    if (!this.prevBtn || !this.nextBtn) return;
    
    // Show/hide navigation buttons based on number of images
    if (this.currentImages.length <= 1) {
      this.prevBtn.style.display = 'none';
      this.nextBtn.style.display = 'none';
    } else {
      this.prevBtn.style.display = 'flex';
      this.nextBtn.style.display = 'flex';
    }
  }
}

// Initialize gallery when DOM is ready
let galleryManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    galleryManager = new GalleryManager();
  });
} else {
  galleryManager = new GalleryManager();
}

// Export for global access if needed
window.GalleryManager = GalleryManager;
window.galleryManager = galleryManager;

// ===========================
// EXISTING PORTFOLIO FUNCTIONALITY
// ===========================

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav');
  if (window.scrollY > 100) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});

// Intersection Observer for animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
    }
  });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
  const elementsToAnimate = document.querySelectorAll('section, .section-title, .project-card, .skill-item');
  elementsToAnimate.forEach(el => observer.observe(el));
});

// Project expand/collapse functionality
function toggleProject(button) {
  const card = button.closest('.project-card');
  const content = card.querySelector('.project-content');
  
  if (content.classList.contains('expanded')) {
    content.classList.remove('expanded');
    button.textContent = button.getAttribute('data-en') || 'View Details ↓';
  } else {
    content.classList.add('expanded');
    button.textContent = button.getAttribute('data-en')?.replace('View Details ↓', 'Hide Details ↑') || 'Hide Details ↑';
  }
}

// Language toggle functionality
let currentLanguage = 'en';

function toggleLanguage() {
  currentLanguage = currentLanguage === 'en' ? 'fr' : 'en';
  
  const elements = document.querySelectorAll('[data-en][data-fr]');
  elements.forEach(element => {
    const text = element.getAttribute(`data-${currentLanguage}`);
    if (text) {
      element.textContent = text;
    }
  });
  
  // Update language toggle button
  const langToggle = document.getElementById('langToggle');
  const langFlag = langToggle.querySelector('.lang-flag');
  const langText = langToggle.querySelector('.lang-text');
  
  if (currentLanguage === 'fr') {
    langFlag.textContent = '🇺🇸';
    langText.textContent = 'EN';
  } else {
    langFlag.textContent = '🇫🇷';
    langText.textContent = 'FR';
  }
}



// ENHANCED MODAL FUNCTIONALITY FOR RESULTS GALLERY
const modal = document.getElementById('mediaModal');
const modalImage = document.getElementById('modalImage');
const modalVideo = document.getElementById('modalVideo');
const modalClose = document.querySelector('.modal-close');

function openModal(mediaSrc, mediaType = 'image') {
  if (!modal || !modalImage || !modalVideo) return;

  console.log('Opening modal with:', mediaSrc, mediaType);

  if (mediaType === 'video') {
    modalImage.style.display = 'none';
    modalVideo.style.display = 'block';

    // Clear previous sources
    const sources = modalVideo.querySelectorAll('source');
    sources.forEach(source => source.remove());

    // Create new source element
    const source = document.createElement('source');
    source.src = mediaSrc;
    source.type = 'video/mp4';
    modalVideo.appendChild(source);

    // Reload video to use new source
    modalVideo.load();
  } else {
    modalVideo.style.display = 'none';
    modalImage.style.display = 'block';
    modalImage.src = mediaSrc;
  }

  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (!modal) return;

  modal.classList.remove('show');

  // Pause and reset video if it's playing
  if (modalVideo && modalVideo.style.display === 'block') {
    modalVideo.pause();
    modalVideo.currentTime = 0;
  }

  setTimeout(() => {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }, 300);
}

// Modal event listeners
if (modalClose) {
  modalClose.addEventListener('click', closeModal);
}

if (modal) {
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeModal();
    }
  });
}

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
    closeModal();
  }
});

// ENHANCED RESULTS GALLERY FUNCTIONALITY
function initializeResultsGallery() {
  // Handle clicks on gallery images
  document.querySelectorAll('.result-gallery .gallery-item img').forEach(img => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal(img.src, 'image');
    });
  });

  // Handle clicks on gallery videos
  document.querySelectorAll('.result-gallery .gallery-item video').forEach(video => {
    video.controls = false;
    video.style.cursor = 'pointer';
    video.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // prefer mp4 source, fallback to currentSrc
      const mp4Src = video.querySelector('source[type="video/mp4"]');
      const src = mp4Src ? mp4Src.src : video.currentSrc;
      openModal(src, 'video');
    });
  });

  console.log('Results gallery initialized:', 
    document.querySelectorAll('.result-gallery .gallery-item img').length, 'images,', 
    document.querySelectorAll('.result-gallery .gallery-item video').length, 'videos');
}

// Initialize results gallery when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeResultsGallery();
});
