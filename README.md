# Optio Platform

An educational platform where students create self-validated diplomas through completing quests. Students build impressive portfolios by documenting their learning journey with public evidence.

> "The Process Is The Goal" - Learning is about who you become through the journey.

**Live Site**: https://www.optioeducation.com

## Core Features

- **Quest System**: Task-based educational challenges with XP rewards across 5 skill pillars
- **Self-Validated Diplomas**: Students create public portfolios showcasing completed quests and evidence (CORE PRODUCT)
- **Evidence Submission**: Multi-format evidence (text, images, videos, documents) for each task
- **AI Tutor**: Conversational AI assistant powered by Gemini for learning support
- **Community Features**: Friends system and quest collaborations (paid tier)
- **Subscription Tiers**: Explorer (free), Creator (Supported), Visionary (Academy)

## Tech Stack

**Backend**: Flask 3.0.0 + Supabase (PostgreSQL) + JWT (httpOnly cookies)
**Frontend**: React 18.3.1 + Vite + TailwindCSS
**AI**: OpenAI/Gemini APIs
**Payments**: Stripe
**Hosting**: Render.com

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Main technical documentation (comprehensive)
- **[core_philosophy.md](./core_philosophy.md)** - Educational philosophy and UX guidelines
- **[production_readiness_plan.md](./production_readiness_plan.md)** - Production launch checklist (85% complete)
- **[MONITORING_SETUP_GUIDE.md](./MONITORING_SETUP_GUIDE.md)** - Monitoring implementation guide
- **[Backend Docs](./backend/docs/)** - Security, performance, compliance documentation

## Project Structure

```
optio/
├── backend/           # Flask API (134 endpoints)
│   ├── routes/        # API endpoints (modular)
│   ├── services/      # Business logic
│   ├── middleware/    # Security, error handling
│   ├── utils/         # Auth, validation, helpers
│   └── docs/          # Technical documentation
├── frontend/          # React SPA
│   ├── src/pages/     # Page components
│   ├── src/components/ # Reusable components
│   ├── src/services/  # API client
│   └── src/hooks/     # Custom React hooks
├── legal/             # Terms of Service, Privacy Policy
└── docs/              # Project documentation
```

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

**Current Hosting**: Render.com

### Development Environment
- **Frontend**: https://optio-dev-frontend.onrender.com (deploys from `develop` branch)
- **Backend**: https://optio-dev-backend.onrender.com (deploys from `develop` branch)

### Production Environment
- **Frontend**: https://www.optioeducation.com (deploys from `main` branch)
- **Backend**: https://optio-prod-backend.onrender.com (deploys from `main` branch)

### Deployment Workflow
1. Push changes to `develop` branch for immediate testing
2. Test thoroughly in dev environment
3. Merge `develop` to `main` when ready for production
4. Auto-deploy to production via Render

See [CLAUDE.md](./CLAUDE.md#production-deployment) for detailed deployment instructions.

## Testing

### Create Test User
1. Register at `/register`
2. Use Supabase dashboard to manually set user role to 'admin' for admin access

### Test Stripe Integration
Use Stripe test cards:
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002

## Production Readiness

Current Status: **85% Complete** (Phase 7 in progress)

- ✅ Phase 1-6: Complete (code cleanup, functionality, performance, data validation)
- ✅ Phase 7.1: Security Audit (134 endpoints audited, 0 critical issues)
- ⚠️ Phase 7.2: Legal Compliance (33% complete, 4 critical blockers identified)
- ✅ Phase 7.3: Monitoring Setup (documentation complete, ready for implementation)
- ✅ Phase 7.4: Documentation Audit (75% complete, 3 critical docs needed)
- 🔄 Phase 8: Launch Preparation (pending)

See [production_readiness_plan.md](./production_readiness_plan.md) for detailed progress.

## Security

- JWT authentication with httpOnly cookies
- CSRF protection on all state-changing requests
- Row Level Security (RLS) enforced on all database queries
- Rate limiting on sensitive endpoints
- Input validation and sanitization
- XSS and SQL injection prevention

Security audit: **PASSED** (0 critical issues, 134 endpoints reviewed)

## Performance

- API response times: <2s (p95)
- Database queries optimized (N+1 elimination)
- RLS policies optimized (82 warnings resolved)
- Memory leak prevention in React components
- Lazy loading and code splitting

## Support

- **Documentation**: See [CLAUDE.md](./CLAUDE.md)
- **Issues**: Contact development team
- **Production Issues**: See [MONITORING_SETUP_GUIDE.md](./MONITORING_SETUP_GUIDE.md) for incident response

## License

© 2025 Optio. All rights reserved.