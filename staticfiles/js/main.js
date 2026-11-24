document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar-header");
  const overlay = document.getElementById("sidebar-overlay");
  const openBtn = document.getElementById("open-sidebar-btn");
  const closeBtn = document.getElementById("close-sidebar-btn");
  const navLinks = document.querySelectorAll(".nav-link");
  const pageViews = document.querySelectorAll(".page-view");

  // Mobile sidebar drawer toggles
    const openSidebar = () => {
        sidebar?.classList.remove("-translate-x-full");
        overlay?.classList.remove("hidden");
    };

    const closeSidebar = () => {
        sidebar?.classList.add("-translate-x-full");
        overlay?.classList.add("hidden");
    };

  openBtn?.addEventListener("click", openSidebar);
  closeBtn?.addEventListener("click", closeSidebar);
  overlay?.addEventListener("click", closeSidebar);

  // Router function to switch active link & content views
  const navigateTo = (targetId) => {
    navLinks.forEach((link) => {
      const page = link.getAttribute("data-page");
      if (page === targetId) {
        link.classList.add("active", "bg-gray-800", "text-white");
        link.classList.remove("text-gray-300");
      } else {
        link.classList.remove("active", "bg-gray-800", "text-white");
        link.classList.add("text-gray-300");
      }
    });

    pageViews.forEach((view) => {
      if (view.id === `view-${targetId}`) {
        view.classList.remove("hidden");
      } else {
        view.classList.add("hidden");
      }
    });

    closeSidebar();

    // Trigger page-specific event if navigating to map
    if (targetId === "home" && typeof window.initTrailMap === "function") {
        setTimeout(() => {
            window.initTrailMap();
        }, 100);
    }
  };

  // Click listeners for links
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetPage = link.getAttribute("data-page");
      window.location.hash = targetPage;
      navigateTo(targetPage);
    });
  });

  // Handle URL hash routing
  const handleHashChange = () => {
    const hash = window.location.hash.replace("#", "") || "home";
    navigateTo(hash);
  };

  window.addEventListener("hashchange", handleHashChange);
  handleHashChange();
});