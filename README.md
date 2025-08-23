# PathWeaver™ Application

A comprehensive web application for interest-led learning, built with React (frontend) and Flask (backend), powered by Supabase and Stripe.

## Project Structure

```
pw_v2/
├── backend/          # Flask API server
├── frontend/         # React SPA
└── README.md
```

## Features

- **User Authentication**: Registration, login, and profile management
- **Quest System**: Browse, start, and complete educational quests
- **Subscription Tiers**: Explorer (free), Creator ($15/mo), Visionary ($50/mo)
- **Community Features**: Friend connections and collaborative learning
- **Progress Tracking**: XP system, dashboards, and transcript generation
- **Admin Tools**: Quest management and submission review

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+
- Supabase account
- Stripe account

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Supabase and Stripe credentials
```

5. Set up Supabase database:
- Create a new Supabase project
- Run the SQL schema from `backend/supabase_schema.sql`
- Copy your project URL and keys to `.env`

6. Run the server:
```bash
python app.py
```

The API will be available at `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your API URL and keys
```

4. Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Environment Variables

### Backend (.env)
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Supabase anon/public key
- `SUPABASE_SERVICE_KEY`: Supabase service role key
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook endpoint secret
- `SECRET_KEY`: Flask secret key for sessions
- `FRONTEND_URL`: Frontend application URL

### Frontend (.env)
- `VITE_API_URL`: Backend API URL
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon/public key
- `VITE_STRIPE_PUBLIC_KEY`: Stripe publishable key

## Deployment

### Backend (Heroku)
1. Create a new Heroku app
2. Set environment variables in Heroku dashboard
3. Deploy using Git or GitHub integration

### Frontend (Vercel)
1. Import project to Vercel
2. Configure environment variables
3. Deploy

## Testing

### Create Test User
1. Register at `/register`
2. Use Supabase dashboard to manually set user role to 'admin' for admin access

### Test Stripe Integration
Use Stripe test cards:
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002

## License

© 2025 PathWeaver™ by Optio. All rights reserved.