function buildCalendar() {
  const date = new Date();
  const monthName = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  const today = date.getDate();
  const currentMonth = date.getMonth();

  const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();
  const startDay = new Date(year, currentMonth, 1).getDay();

  let html = `<h3>${monthName} ${year}</h3>`;
  html += `<div class="calendar-grid">`;

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  for (let day of dayNames) {
    html += `<div class="day-name">${day}</div>`;
  }

  for (let i = 0; i < startDay; i++) {
    html += `<div class="empty-day"></div>`;
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = (i === today) ? 'today' : '';
    html += `<div class="day ${isToday}">${i}</div>`;
  }

  html += `</div>`;
  document.getElementById('calendar-widget').innerHTML = html;
}

buildCalendar();
