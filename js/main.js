// ===== Header scroll state =====
const header = document.getElementById("header");
const onScroll = () => {
  if (window.scrollY > 60) header.classList.add("scrolled");
  else header.classList.remove("scrolled");
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ===== Mobile menu toggle =====
const navToggle = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");
navToggle.addEventListener("click", () => {
  navMenu.classList.toggle("open");
  header.classList.toggle("menu-open");
});
// close menu when a link is clicked
navMenu.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    navMenu.classList.remove("open");
    header.classList.remove("menu-open");
  })
);

// ===== Scroll reveal =====
const revealTargets = document.querySelectorAll(
  ".about-intro, .servants, .worship-card, .sermon-feature, .sermon-side, .news-item, .mission-card, .location-grid"
);
revealTargets.forEach((el) => el.classList.add("reveal"));

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = `${(i % 4) * 0.08}s`;
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
revealTargets.forEach((el) => io.observe(el));
