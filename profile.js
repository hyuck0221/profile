(() => {
  const currentDate = new Date();

  const formattedCurrentDate = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(currentDate);

  document.querySelectorAll("[data-career-current-date]").forEach((element) => {
    element.textContent = formattedCurrentDate;
    element.setAttribute("datetime", currentDate.toISOString().slice(0, 10));
  });
})();
