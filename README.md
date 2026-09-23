# DAYZ WIPE — Community Website

A real full-stack DayZ community wipe calendar.

## Included
- PostgreSQL-backed shared wipe database
- User registration/login
- Server-owner submissions
- Server metadata: platform, region, Discord and website
- Wipe submissions
- Approval workflow for admins
- Search and platform/region filters
- Calendar + upcoming wipe list
- Responsive dark DayZ-inspired UI
- JWT authentication

## Run locally
1. Install Node.js 20+.
2. Create a PostgreSQL database.
3. Copy `.env.example` to `.env` and set DATABASE_URL and JWT_SECRET.
4. Run `npm install`
5. Run `npm start`
6. Open http://localhost:3000

## Admin
After creating your first user, change that user's `role` to `admin` in PostgreSQL:
UPDATE users SET role='admin' WHERE email='your-email@example.com';

The API already contains admin approval endpoints; the next UI iteration can add a dedicated admin dashboard.

## Deploy
The included `render.yaml` is a starting point for Render. Create a PostgreSQL database, set DATABASE_URL and JWT_SECRET as environment variables, then deploy the Node service.

## Production hardening still recommended
- Email verification/password reset
- Rate limiting
- CAPTCHA/anti-spam on public submissions
- Admin dashboard UI
- Automated Discord notifications
- Server-owner recurring wipe schedules
- Audit log and moderation tools
- Backups
