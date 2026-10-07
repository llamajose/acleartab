// Minimal iCalendar parser for Canvas calendar feeds.
// Shared by the service worker (importScripts) and the Node tests.

function icsUnescape(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

// Returns epoch ms. Date-only values (all-day) are treated as due at 11:59 PM local time.
function icsDate(params, value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) {
    return { ms: new Date(+y, +mo - 1, +d, 23, 59, 0).getTime(), allDay: true };
  }
  const ms = z
    ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    : new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime(); // floating / TZID: assume local
  return { ms, allDay: false };
}

function parseICS(text) {
  // Unfold continuation lines (RFC 5545: line break followed by a space or tab)
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.due) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    const semi = head.indexOf(';');
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    const params = semi < 0 ? '' : head.slice(semi + 1);

    if (name === 'UID') cur.uid = value;
    else if (name === 'URL') cur.url = value;
    else if (name === 'DTSTART') {
      const d = icsDate(params, value);
      if (d) { cur.due = d.ms; cur.allDay = d.allDay; }
    } else if (name === 'SUMMARY') {
      const raw = icsUnescape(value);
      // Canvas appends the course in brackets: "Monopolies [ECON-C2001]"
      const m = raw.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      cur.title = m ? m[1] : raw;
      cur.course = m ? m[2] : '';
    }
  }

  for (const e of events) {
    e.kind = /assignment/i.test(e.uid || '') ? 'assignment' : 'event';
  }
  return events;
}

if (typeof module !== 'undefined') module.exports = { parseICS };
