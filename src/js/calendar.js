function buildCalendar() {
  const date = new Date();
  const monthName = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  const today = date.getDate();
  const month = date.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();

  let html = `<h3>${monthName} ${year}</h3><div class="calendar-grid">`;

  for (const name of ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']) {
    html += `<div class="day-name">${name}</div>`;
  }
  for (let i = 0; i < startDay; i++) {
    html += `<div class="empty-day"></div>`;
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const cls = i === today ? 'today' : (i < today ? 'past' : '');
    html += `<div class="day ${cls}">${i}</div>`;
  }

  html += `</div>`;
  document.getElementById('calendar-widget').innerHTML = html;
}

buildCalendar();
