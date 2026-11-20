# UH Sugar Land Student Center Web App

CIS 2336 individual project (Fall 2026) by Jacobe Chester.

A website for a new student center at UH Sugar Land. Visitors can read the FAQ and reserve one of five rooms. The Node.js/Express backend checks each request and answers with a confirmation or a decline.

## Project structure

```text
project-folder/
├── frontend/
│   ├── index.html        (Homepage: dynamic menu, floor plan, video, Developer Contact)
│   ├── FAQ.html          (5 collapsible FAQ items)
│   ├── roombooking.html  (Room booking form with validation)
│   ├── reference.html    (AI prompts, tools, and sources)
│   ├── script.js         (Dynamic menu, FAQ, form validation, API calls)
│   └── styles.css
├── backend/
│   └── app.js            (Express server and booking API)
├── package.json
└── README.md
```

## How to run

Install [Node.js](https://nodejs.org/) first. In VS Code, open a terminal in the project root (the folder containing both `frontend` and `backend`) and run:

```bash
npm install
npm start
```

Open http://localhost:8080 in a browser. Open the site through the server, not by double-clicking the HTML files, or the booking features will not work.

`npm start` runs `node backend/app.js`. Stop the server with Ctrl+C.

## Booking API

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/api/rooms` | Lists the five rooms and their capacities |
| GET | `/api/bookings?date=YYYY-MM-DD&room=id` | Lists booked time slots for a date (room is optional) |
| POST | `/api/bookings` | Validates a booking. Returns `201` confirmed, `409` declined (time already booked), or `400` invalid |

Bookings are stored in a JavaScript object in `backend/app.js`, so they reset every time the server restarts.

### Booking rules

- Open 8:00 AM to 10:00 PM; start times on the hour or half hour
- Length 30 minutes to 3 hours, ending by 10:00 PM
- Up to 60 days ahead; no past dates or times (Houston time)
- UH email required (`@uh.edu`, `@cougarnet.uh.edu`, or `@central.uh.edu`)
- Number of people cannot exceed the room's capacity

### Rooms

| Id | Room | Seats |
| --- | --- | --- |
| `pod` | Study Pod 101 | 4 |
| `studio` | Collab Studio 102 | 8 |
| `media` | Media Room 201 | 6 |
| `esports` | Esports Lounge 202 | 12 |
| `hall` | Event Hall 301 | 40 |
