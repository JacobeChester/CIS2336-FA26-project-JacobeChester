// UH Sugar Land Student Center - client-side JavaScript
// One file shared by all pages. Each section only runs if its page elements exist.

// ---------- 1. Dynamic navigation menu ----------

const NAV_ITEMS = [
  { label: 'Home', href: 'index.html' },
  { label: 'FAQ', href: 'FAQ.html' },
  { label: 'Book a room', href: 'roombooking.html' },
  { label: 'References', href: 'reference.html' }
];

function buildMenu() {
  const nav = document.getElementById('site-nav');
  const toggle = document.querySelector('.nav-toggle');
  if (!nav) return;

  const currentFile = window.location.pathname.split('/').pop() || 'index.html';
  const list = document.createElement('ul');

  NAV_ITEMS.forEach((item) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    if (item.href === currentFile) link.setAttribute('aria-current', 'page');
    li.appendChild(link);
    list.appendChild(li);
  });

  nav.replaceChildren(list); // replaces the <noscript> fallback

  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }
}

// ---------- Shared helpers ----------

// Today's date (YYYY-MM-DD) in Houston time
function todayISO() {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysISO(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
}

// ---------- 2. FAQ collapsibles ----------

function initFaq() {
  const triggers = document.querySelectorAll('.faq-trigger');
  triggers.forEach((button) => {
    button.addEventListener('click', () => {
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      const willOpen = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(willOpen));
      panel.hidden = !willOpen;
    });
  });
}

// ---------- 3. Home page: live floor plan status ----------

async function initFloorPlan() {
  const tiles = document.querySelectorAll('.room-tile');
  const note = document.getElementById('plan-note');
  if (tiles.length === 0) return;

  try {
    const response = await fetch(`/api/bookings?date=${todayISO()}`);
    if (!response.ok) throw new Error('Request failed');
    const data = await response.json();

    tiles.forEach((tile) => {
      const status = tile.querySelector('[data-status]');
      const count = (data.slots[tile.dataset.room] || []).length;
      if (count === 0) {
        status.textContent = 'Free all day';
        status.dataset.state = 'free';
      } else {
        status.textContent = count === 1 ? '1 booking today' : `${count} bookings today`;
        status.dataset.state = 'busy';
      }
    });
  } catch (error) {
    tiles.forEach((tile) => {
      tile.querySelector('[data-status]').textContent = 'Availability unavailable';
    });
    if (note) note.textContent = 'Select a room to start a booking. Live availability needs the server to be running.';
  }
}

// ---------- 4. Room booking form ----------

const OPEN_MIN = 8 * 60;
const CLOSE_MIN = 22 * 60;
const MAX_DAYS_AHEAD = 60;
const UH_EMAIL = /^[^\s@]+@(?:cougarnet\.|central\.)?uh\.edu$/i;
const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u;

function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;

  const fields = {
    name: form.elements.name,
    email: form.elements.email,
    room: form.elements.room,
    date: form.elements.date,
    start: form.elements.start,
    duration: form.elements.duration,
    attendees: form.elements.attendees,
    purpose: form.elements.purpose
  };
  const resultBox = document.getElementById('result');
  const availability = document.getElementById('availability');
  const submitButton = document.getElementById('submit-btn');

  // Fill the start time list: 8:00 AM to 9:30 PM in 30-minute steps
  for (let minutes = OPEN_MIN; minutes < CLOSE_MIN; minutes += 30) {
    const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const option = document.createElement('option');
    option.value = hhmm;
    option.textContent = formatTime(hhmm);
    fields.start.appendChild(option);
  }

  // Date limits: today through 60 days ahead
  const today = todayISO();
  fields.date.min = today;
  fields.date.max = addDaysISO(today, MAX_DAYS_AHEAD);

  // Preselect a room when the home page floor plan sends us here (?room=hall)
  const requestedRoom = new URLSearchParams(window.location.search).get('room');
  if (requestedRoom && Array.from(fields.room.options).some((o) => o.value === requestedRoom)) {
    fields.room.value = requestedRoom;
  }

  function capacityOf(select) {
    const option = select.options[select.selectedIndex];
    return option && option.dataset.capacity ? Number(option.dataset.capacity) : null;
  }

  function syncCapacity() {
    const capacity = capacityOf(fields.room);
    if (capacity) fields.attendees.max = String(capacity);
    else fields.attendees.removeAttribute('max');
  }

  // ----- validation (the server repeats these checks) -----

  function nowMinutesInHouston() {
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
    return Number(parts.hour) * 60 + Number(parts.minute);
  }

  const validators = {
    name(value) {
      const v = value.trim();
      if (!v) return 'Enter your full name.';
      if (v.length < 2 || v.length > 60 || !NAME_PATTERN.test(v)) return 'Use 2 to 60 letters. Spaces, periods, hyphens, and apostrophes are allowed.';
      return '';
    },
    email(value) {
      const v = value.trim();
      if (!v) return 'Enter your UH email address.';
      if (!UH_EMAIL.test(v)) return 'Use your UH email (for example, name@cougarnet.uh.edu).';
      return '';
    },
    room(value) {
      return value ? '' : 'Choose one of the five rooms.';
    },
    date(value) {
      if (!value) return 'Choose a date.';
      if (value < today) return 'Choose today or a future date.';
      if (value > addDaysISO(today, MAX_DAYS_AHEAD)) return `Rooms can be booked up to ${MAX_DAYS_AHEAD} days ahead.`;
      return '';
    },
    start(value) {
      if (!value) return 'Choose a start time.';
      const [h, m] = value.split(':').map(Number);
      if (fields.date.value === today && h * 60 + m <= nowMinutesInHouston()) return 'That start time has already passed today.';
      return '';
    },
    duration(value) {
      if (!value) return 'Choose how long you need the room.';
      const start = fields.start.value;
      if (start) {
        const [h, m] = start.split(':').map(Number);
        if (h * 60 + m + Number(value) > CLOSE_MIN) return 'That booking would run past closing time (10:00 PM).';
      }
      return '';
    },
    attendees(value) {
      if (value === '') return 'Enter how many people will use the room.';
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) return 'Enter a whole number of at least 1.';
      const capacity = capacityOf(fields.room);
      if (capacity && n > capacity) return `${fields.room.options[fields.room.selectedIndex].text.replace(/ \(seats \d+\)/, '')} fits up to ${capacity} people.`;
      return '';
    },
    purpose(value) {
      return value.length > 200 ? 'Keep the purpose under 200 characters.' : '';
    }
  };

  function showError(field, message) {
    const errorBox = document.getElementById(`${field.name}-error`);
    errorBox.textContent = message;
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }

  function validateField(field) {
    const message = validators[field.name](field.value);
    showError(field, message);
    return message === '';
  }

  function validateAll() {
    let firstInvalid = null;
    Object.values(fields).forEach((field) => {
      if (!validateField(field) && !firstInvalid) firstInvalid = field;
    });
    return firstInvalid;
  }

  // Validate a field when the user leaves it; re-check once it already shows an error
  Object.values(fields).forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.hasAttribute('aria-invalid')) validateField(field);
    });
    field.addEventListener('change', () => {
      if (field.hasAttribute('aria-invalid')) validateField(field);
    });
  });

  // Fields that depend on each other
  fields.room.addEventListener('change', () => {
    syncCapacity();
    if (fields.attendees.value !== '') validateField(fields.attendees);
    loadAvailability();
  });
  fields.date.addEventListener('change', () => {
    loadAvailability();
    if (fields.start.value) validateField(fields.start);
  });
  fields.start.addEventListener('change', () => {
    if (fields.duration.value) validateField(fields.duration);
  });

  // ----- availability panel (GET) -----

  async function loadAvailability() {
    const room = fields.room.value;
    const date = fields.date.value;
    availability.replaceChildren();

    if (!room || !date || validators.date(date)) {
      const p = document.createElement('p');
      p.className = 'room-info';
      p.textContent = 'Choose a room and a date to see what is already booked.';
      availability.appendChild(p);
      return;
    }

    try {
      const response = await fetch(`/api/bookings?room=${encodeURIComponent(room)}&date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error('Request failed');
      const data = await response.json();
      const slots = data.slots[room] || [];
      const roomName = fields.room.options[fields.room.selectedIndex].text.replace(/ \(seats \d+\)/, '');

      const info = document.createElement('p');
      info.className = 'room-info';
      info.textContent = slots.length === 0
        ? `${roomName} is open all day on ${formatDate(date)}.`
        : `Already booked in ${roomName} on ${formatDate(date)}:`;
      availability.appendChild(info);

      if (slots.length > 0) {
        const list = document.createElement('ul');
        list.className = 'slot-list';
        slots.forEach((slot) => {
          const li = document.createElement('li');
          li.textContent = `${formatTime(slot.start)} to ${formatTime(slot.end)}`;
          list.appendChild(li);
        });
        availability.appendChild(list);
      }
    } catch (error) {
      const p = document.createElement('p');
      p.className = 'room-info';
      p.textContent = 'Cannot load availability. Make sure the server is running (npm start).';
      availability.appendChild(p);
    }
  }

  // ----- result box -----

  function showResult(kind, title, lines, details) {
    resultBox.className = `result ${kind}`;
    resultBox.replaceChildren();

    const heading = document.createElement('h2');
    heading.textContent = title;
    resultBox.appendChild(heading);

    lines.forEach((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      resultBox.appendChild(p);
    });

    if (details) {
      const dl = document.createElement('dl');
      details.forEach(([term, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.append(dt, dd);
      });
      resultBox.appendChild(dl);
    }

    resultBox.hidden = false;
    resultBox.focus();
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ----- submit (POST) -----

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    resultBox.hidden = true;

    const firstInvalid = validateAll();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      room: fields.room.value,
      date: fields.date.value,
      start: fields.start.value,
      duration: Number(fields.duration.value),
      attendees: Number(fields.attendees.value),
      purpose: fields.purpose.value.trim()
    };

    submitButton.disabled = true;
    submitButton.textContent = 'Checking availability';

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.status === 201) {
        const b = data.booking;
        showResult('ok', 'Booking confirmed', [`${b.roomName} is reserved for you.`], [
          ['Confirmation', b.id],
          ['Date', formatDate(b.date)],
          ['Time', `${formatTime(b.start)} to ${formatTime(b.end)}`],
          ['People', String(b.attendees)]
        ]);
        // Clear the form but keep the room and date so the availability panel
        // keeps showing the slot that was just booked.
        const keepRoom = fields.room.value;
        const keepDate = fields.date.value;
        form.reset();
        fields.room.value = keepRoom;
        fields.date.value = keepDate;
        Object.values(fields).forEach((field) => showError(field, ''));
        syncCapacity();
        loadAvailability();
      } else if (response.status === 409) {
        const times = data.conflicts.map((c) => `${formatTime(c.start)} to ${formatTime(c.end)}`).join(', ');
        showResult('no', 'Booking declined', [data.message, `Already booked: ${times}.`, 'Choose a different time or another room and submit again.']);
        loadAvailability();
      } else if (response.status === 400 && data.errors) {
        let firstField = null;
        Object.entries(data.errors).forEach(([name, message]) => {
          if (fields[name]) {
            showError(fields[name], message);
            if (!firstField) firstField = fields[name];
          }
        });
        if (firstField) firstField.focus();
      } else {
        showResult('no', 'Something went wrong', [data.message || 'The server could not process the request. Try again.']);
      }
    } catch (error) {
      showResult('no', 'Cannot reach the server', ['Make sure the server is running (npm start) and try again.']);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Reserve room';
    }
  });

  syncCapacity();
  loadAvailability();
}

// ---------- Start everything ----------

document.addEventListener('DOMContentLoaded', () => {
  buildMenu();
  initFaq();
  initFloorPlan();
  initBookingForm();
});
