"use strict";
/* ui/sidebar.js — منوی جمع‌شوندهٔ دسکتاپ
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("ui/sidebar");
// ---------- منوی جمع‌شونده دسکتاپ ----------
(function () {
  const shell = document.querySelector(".shell");
  const toggle = document.getElementById("desktopMenuToggle");

  if (!shell || !toggle) return;

  const storageKey = "desktopSidebarCollapsedV2";

  function setCollapsed(collapsed) {
    shell.classList.toggle("sidebar-collapsed", collapsed);

    toggle.setAttribute("aria-expanded", String(!collapsed));

    const label = collapsed ? "باز کردن منو" : "جمع کردن منو";

    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);

    const labelElement = toggle.querySelector(".menu-toggle-label");
    if (labelElement) {
      labelElement.textContent = label;
    }

    toggle.querySelector("span:first-child").innerHTML = collapsed
      ? ico("menu")
      : ico("chevs-r", "edge");

    document.querySelectorAll(".nav button[data-page]").forEach((button) => {
      if (!button.dataset.sidebarLabel) {
        button.dataset.sidebarLabel = button.textContent.trim();
      }

      button.title = collapsed ? button.dataset.sidebarLabel : "";
    });

    try {
      localStorage.setItem(storageKey, String(collapsed));
    } catch (error) {}
  }

  // حالت پیش‌فرض: منو باز باشد.
  let initiallyCollapsed = false;

  try {
    const saved = localStorage.getItem(storageKey);

    if (saved !== null) {
      initiallyCollapsed = saved === "true";
    }
  } catch (error) {}

  setCollapsed(initiallyCollapsed);

  toggle.addEventListener("click", function () {
    const collapsed = !shell.classList.contains("sidebar-collapsed");
    setCollapsed(collapsed);
  });
})();
