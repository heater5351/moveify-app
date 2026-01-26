# Moveify App

A fitness and physiotherapy application for clinicians to assign exercise programs to patients.

## Quick Start

### Option 1: Use the Startup Script (Easiest)
1. Double-click `start-dev.bat`
2. Two command windows will open (backend and frontend)
3. Wait a few seconds for both servers to start
4. Open browser to http://localhost:5173

### Option 2: Manual Start

**Start Backend:**
```bash
cd backend
npm run dev
```

**Start Frontend (in another terminal):**
```bash
cd frontend
npm run dev
```

## Login Credentials

**Clinician:**
- Email: `clinician@physitrack.com`
- Password: `clinic123`

**Patient (example):**
- Patients are created through the invitation system
- Once they set their password, they can login

## Features

### For Clinicians:
- ✅ View and manage exercise library
- ✅ Invite new patients via secure invitation links
- ✅ Assign exercise programs to patients
- ✅ Configure program start dates, frequency, and duration
- ✅ Edit patient information
- ✅ Delete patients (removes their login credentials)
- ✅ View patient list (synced with database)

### For Patients:
- ✅ View assigned exercise programs
- ✅ Track exercise completion
- ✅ See personalized exercise details

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS v3
- React Router DOM

**Backend:**
- Node.js + Express 4
- SQLite (better-sqlite3)
- bcrypt (password hashing)
- JWT-ready authentication

## Development Tools

**Nodemon** - Automatically restarts the backend server when files change
- Backend runs with nodemon in development mode
- Any changes to server files trigger automatic restart
- No manual server restarts needed!

## Project Structure

```
moveify-app/
├── backend/
│   ├── database/
│   │   ├── db.js          # Database connection
│   │   ├── init.js        # Schema initialization
│   │   ├── migrate.js     # Migration scripts
│   │   └── moveify.db     # SQLite database file
│   ├── routes/
│   │   ├── auth.js        # Login/signup endpoints
│   │   ├── invitations.js # Patient invitation system
│   │   └── patients.js    # Patient CRUD operations
│   ├── server.js          # Express server
│   ├── package.json
│   └── nodemon.json       # Nodemon configuration
│
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── types/         # TypeScript type definitions
│   │   ├── App.tsx        # Main application
│   │   └── main.tsx       # Entry point
│   ├── package.json
│   └── vite.config.ts
│
├── start-dev.bat          # Easy startup script (Windows)
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/login` - Login with email/password

### Invitations
- `POST /api/invitations/generate` - Generate patient invitation
- `GET /api/invitations/validate/:token` - Validate invitation token
- `POST /api/invitations/set-password` - Patient sets password

### Patients
- `GET /api/patients` - Get all patients
- `GET /api/patients/:id` - Get single patient
- `DELETE /api/patients/:id` - Delete patient

## Database Schema

### users
- id, email, password_hash, role, name, dob, phone, address, condition, created_at
- role: 'clinician' or 'patient'
- password_hash: NULL for invited patients who haven't set password yet

### invitation_tokens
- id, token, email, role, name, dob, phone, address, condition, used, expires_at, created_at
- Tokens expire after 7 days

## Troubleshooting

**Server keeps stopping:**
- Now using nodemon which automatically restarts on crashes
- Check the terminal output for error messages
- Make sure port 3000 (backend) and 5173 (frontend) are available

**Connection errors:**
- Verify both backend and frontend are running
- Backend should be on http://localhost:3000
- Frontend should be on http://localhost:5173

**Database errors:**
- Run migration: `cd backend && node database/migrate.js`
- Check that moveify.db file exists in backend/database/

**White screen:**
- Clear browser cache (Ctrl+Shift+R)
- Check browser console for errors
- Restart frontend dev server

## Next Steps

- [ ] Add email sending for invitations
- [ ] Implement exercise completion tracking in database
- [ ] Add daily check-in feature for patients
- [ ] Create auto-intensity adjustment algorithm
- [ ] Expand exercise library
- [ ] Add data export features
