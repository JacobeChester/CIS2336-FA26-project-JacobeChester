// UH Sugar Land Student Center - backend (Node.js + Express)
// Serves the frontend files and handles the room booking API.
// Bookings are kept in a plain JavaScript object, so they are NOT permanent:
// they disappear whenever the server restarts.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ---------- Data ----------

const ROOMS = [
  { id: 'pod',     name: 'Study Pod 101',       capacity: 4,  floor: 1, description: 'Quiet pod with a whiteboard for small study groups.' },
  { id: 'studio',  name: 'Collab Studio 102',   capacity: 8,  floor: 1, description: 'Wall-mounted display and movable tables for team projects.' },
  { id: 'media',   name: 'Media Room 201',      capacity: 6,  floor: 2, description: 'Sound-proofed room with a green screen and lighting.' },
  { id: 'esports', name: 'Esports Lounge 202',  capacity: 12, floor: 2, description: 'Gaming PCs, console stations, and a shared big screen.' },
  { id: 'hall',    name: 'Event Hall 301',      capacity: 40, floor: 3, description: 'Open hall for club meetings, workshops, and speakers.' }
];

// bookings[roomId] = [ { id, name, email, date, start, end, attendees, purpose } ]
const bookings = {};
ROOMS.forEach((room) => { bookings[room.id] = []; });
let nextBookingNumber = 1001;

// ---------- Rules ----------

const OPEN_MIN = 8 * 60;        // 8:00 AM
const CLOSE_MIN = 22 * 60;      // 10:00 PM
const MAX_DURATION = 180;       // minutes
const MAX_DAYS_AHEAD = 60;
const UH_EMAIL = /^[^\s@]+@(?:cougarnet\.|central\.)?uh\.edu$/i;
const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u;

// ---------- Helpers ----------

function findRoom(id) {
  return ROOMS.find((room) => room.id === id);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// Current date/time in Houston, so "today" and "past" checks match campus time.
function houstonNow() {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Returns an object of field -> error message. Empty object means the data is valid.
function validateBooking(body) {
  const errors = {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const roomId = String(body.room || '');
  const date = String(body.date || '');
  const start = String(body.start || '');
  const duration = Number(body.duration);
  const attendees = Number(body.attendees);
  const purpose = String(body.purpose || '').trim();
  const room = findRoom(roomId);
  const now = houstonNow();

  if (!name) errors.name = 'Enter your full name.';
  else if (name.length < 2 || name.length > 60 || !NAME_PATTERN.test(name)) errors.name = 'Use 2 to 60 letters. Spaces, periods, hyphens, and apostrophes are allowed.';

  if (!email) errors.email = 'Enter your UH email address.';
  else if (!UH_EMAIL.test(email)) errors.email = 'Use your UH email (for example, name@cougarnet.uh.edu).';

  if (!room) errors.room = 'Choose one of the five rooms.';

  if (!date) errors.date = 'Choose a date.';
  else if (!isRealDate(date)) errors.date = 'Enter a valid date.';
  else if (date < now.date) errors.date = 'Choose today or a future date.';
  else if (date > addDays(now.date, MAX_DAYS_AHEAD)) errors.date = `Rooms can be booked up to ${MAX_DAYS_AHEAD} days ahead.`;

  let startMin = null;
  if (!start) errors.start = 'Choose a start time.';
  else if (!/^([01]\d|2[0-3]):(00|30)$/.test(start)) errors.start = 'Start times are on the hour or half hour.';
  else {
    startMin = toMinutes(start);
    if (startMin < OPEN_MIN || startMin >= CLOSE_MIN) errors.start = 'The center is open 8:00 AM to 10:00 PM.';
    else if (!errors.date && date === now.date && startMin <= now.minutes) errors.start = 'That start time has already passed today.';
  }

  if (!Number.isInteger(duration) || duration < 30 || duration > MAX_DURATION || duration % 30 !== 0) {
    errors.duration = 'Choose a length from 30 minutes to 3 hours.';
  } else if (startMin !== null && !errors.start && startMin + duration > CLOSE_MIN) {
    errors.duration = 'That booking would run past closing time (10:00 PM).';
  }

  if (!Number.isInteger(attendees) || attendees < 1) errors.attendees = 'Enter at least 1 person.';
  else if (room && attendees > room.capacity) errors.attendees = `${room.name} fits up to ${room.capacity} people.`;

  if (purpose.length > 200) errors.purpose = 'Keep the purpose under 200 characters.';

  return errors;
}

// ---------- Middleware ----------

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---------- API ----------

// GET /api/rooms -> the five rooms
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: ROOMS });
});

// GET /api/bookings?date=YYYY-MM-DD[&room=id] -> booked time slots (no personal info)
app.get('/api/bookings', (req, res) => {
  const { date, room } = req.query;
  if (!date || !isRealDate(String(date))) {
    return res.status(400).json({ message: 'Provide a date as YYYY-MM-DD.' });
  }
  if (room && !findRoom(String(room))) {
    return res.status(404).json({ message: 'Unknown room.' });
  }
  const roomIds = room ? [String(room)] : ROOMS.map((r) => r.id);
  const slots = {};
  roomIds.forEach((id) => {
    slots[id] = bookings[id]
      .filter((b) => b.date === date)
      .map((b) => ({ start: b.start, end: b.end }))
      .sort((a, b) => a.start.localeCompare(b.start));
  });
  res.json({ date, slots });
});

// POST /api/bookings -> validate, check availability, confirm or decline
app.post('/api/bookings', (req, res) => {
  const body = req.body || {};
  const errors = validateBooking(body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ status: 'invalid', message: 'Fix the highlighted fields and try again.', errors });
  }

  const room = findRoom(String(body.room));
  const date = String(body.date);
  const startMin = toMinutes(String(body.start));
  const endMin = startMin + Number(body.duration);

  const conflicts = bookings[room.id].filter((b) =>
    b.date === date && startMin < toMinutes(b.end) && endMin > toMinutes(b.start)
  );

  if (conflicts.length > 0) {
    return res.status(409).json({
      status: 'declined',
      message: `${room.name} is already booked during that time.`,
      conflicts: conflicts.map((b) => ({ start: b.start, end: b.end }))
    });
  }

  const booking = {
    id: `SC-${nextBookingNumber++}`,
    name: String(body.name).trim(),
    email: String(body.email).trim().toLowerCase(),
    room: room.id,
    roomName: room.name,
    date,
    start: toHHMM(startMin),
    end: toHHMM(endMin),
    attendees: Number(body.attendees),
    purpose: String(body.purpose || '').trim()
  };
  bookings[room.id].push(booking);

  res.status(201).json({ status: 'confirmed', message: `${room.name} is booked.`, booking });
});

// Unknown API routes get JSON instead of an HTML page
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not found.' });
});

// Unexpected errors (for example, malformed JSON)
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: 'invalid', message: 'The request body was not valid JSON.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Student Center site running at http://localhost:${PORT}`);
});
