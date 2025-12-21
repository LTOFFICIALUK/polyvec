# Authentication Setup Guide

## Overview

The authentication system uses:
- **Email/Password** authentication
- **JWT tokens** stored in HTTP-only cookies
- **PostgreSQL** database for user storage
- **bcryptjs** for password hashing

## Environment Variables

Add these to your `.env.local` file:

```env
# Database connection (VPS)
DATABASE_URL=postgresql://polytrade:<YOUR_PASSWORD>@<YOUR_VPS_IP>:5432/polytrade

# JWT Secret (change this to a secure random string in production)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

## Database Setup on VPS

### Option 1: Run Migration Manually

SSH into your VPS and run:

```bash
   ssh root@<YOUR_VPS_IP>

# Connect to PostgreSQL
sudo -u postgres psql

# Create database and user (if not exists)
CREATE DATABASE polytrade;
CREATE USER polytrade WITH PASSWORD '<YOUR_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON DATABASE polytrade TO polytrade;
\q

# Run migration
psql -U polytrade -d polytrade -h localhost -f /path/to/database/migrations/004_create_users.sql
```

### Option 2: Use Setup Script

```bash
chmod +x scripts/setup-vps-db.sh
./scripts/setup-vps-db.sh
```

## Database Schema

### Users Table
- `id` - Primary key
- `email` - Unique email address
- `password_hash` - Bcrypt hashed password
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp
- `last_login` - Last login timestamp
- `is_active` - Account status (default: true)

### Email List Table
- `id` - Primary key
- `email` - Unique email address
- `created_at` - Subscription timestamp
- `source` - Where the signup came from (default: 'landing_page')

## API Endpoints

### POST `/api/auth/signup`
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### POST `/api/auth/login`
Authenticate and get JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "last_login": "2024-01-01T00:00:00Z"
  }
}
```

Sets HTTP-only cookie: `auth-token`

### POST `/api/auth/logout`
Clear authentication cookie.

### GET `/api/auth/me`
Get current authenticated user.

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "last_login": "2024-01-01T00:00:00Z"
  }
}
```

### POST `/api/email-list`
Add email to newsletter list.

**Request:**
```json
{
  "email": "user@example.com",
  "source": "footer"
}
```

## Usage in Components

### Check Authentication
```tsx
import { useAuth } from '@/contexts/AuthContext'

const MyComponent = () => {
  const { user, isLoading, logout } = useAuth()
  
  if (isLoading) return <div>Loading...</div>
  if (!user) return <div>Please log in</div>
  
  return <div>Welcome, {user.email}!</div>
}
```

### Protect Routes
```tsx
import ProtectedRoute from '@/components/ProtectedRoute'

export default function MyPage() {
  return (
    <ProtectedRoute>
      <YourContent />
    </ProtectedRoute>
  )
}
```

## Security Notes

1. **JWT Secret**: Change `JWT_SECRET` to a secure random string in production
2. **Password Requirements**: Minimum 8 characters (enforced in signup)
3. **HTTPS**: Use HTTPS in production for secure cookie transmission
4. **Database**: Ensure PostgreSQL is only accessible from trusted IPs

## Next Steps

1. Install dependencies: `npm install`
2. Set up database on VPS
3. Configure environment variables
4. Test signup/login flow
5. Update other pages to use `ProtectedRoute` as needed


## Overview

The authentication system uses:
- **Email/Password** authentication
- **JWT tokens** stored in HTTP-only cookies
- **PostgreSQL** database for user storage
- **bcryptjs** for password hashing

## Environment Variables

Add these to your `.env.local` file:

```env
# Database connection (VPS)
DATABASE_URL=postgresql://polytrade:<YOUR_PASSWORD>@<YOUR_VPS_IP>:5432/polytrade

# JWT Secret (change this to a secure random string in production)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

## Database Setup on VPS

### Option 1: Run Migration Manually

SSH into your VPS and run:

```bash
   ssh root@<YOUR_VPS_IP>

# Connect to PostgreSQL
sudo -u postgres psql

# Create database and user (if not exists)
CREATE DATABASE polytrade;
CREATE USER polytrade WITH PASSWORD '<YOUR_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON DATABASE polytrade TO polytrade;
\q

# Run migration
psql -U polytrade -d polytrade -h localhost -f /path/to/database/migrations/004_create_users.sql
```

### Option 2: Use Setup Script

```bash
chmod +x scripts/setup-vps-db.sh
./scripts/setup-vps-db.sh
```

## Database Schema

### Users Table
- `id` - Primary key
- `email` - Unique email address
- `password_hash` - Bcrypt hashed password
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp
- `last_login` - Last login timestamp
- `is_active` - Account status (default: true)

### Email List Table
- `id` - Primary key
- `email` - Unique email address
- `created_at` - Subscription timestamp
- `source` - Where the signup came from (default: 'landing_page')

## API Endpoints

### POST `/api/auth/signup`
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### POST `/api/auth/login`
Authenticate and get JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "last_login": "2024-01-01T00:00:00Z"
  }
}
```

Sets HTTP-only cookie: `auth-token`

### POST `/api/auth/logout`
Clear authentication cookie.

### GET `/api/auth/me`
Get current authenticated user.

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "last_login": "2024-01-01T00:00:00Z"
  }
}
```

### POST `/api/email-list`
Add email to newsletter list.

**Request:**
```json
{
  "email": "user@example.com",
  "source": "footer"
}
```

## Usage in Components

### Check Authentication
```tsx
import { useAuth } from '@/contexts/AuthContext'

const MyComponent = () => {
  const { user, isLoading, logout } = useAuth()
  
  if (isLoading) return <div>Loading...</div>
  if (!user) return <div>Please log in</div>
  
  return <div>Welcome, {user.email}!</div>
}
```

### Protect Routes
```tsx
import ProtectedRoute from '@/components/ProtectedRoute'

export default function MyPage() {
  return (
    <ProtectedRoute>
      <YourContent />
    </ProtectedRoute>
  )
}
```

## Security Notes

1. **JWT Secret**: Change `JWT_SECRET` to a secure random string in production
2. **Password Requirements**: Minimum 8 characters (enforced in signup)
3. **HTTPS**: Use HTTPS in production for secure cookie transmission
4. **Database**: Ensure PostgreSQL is only accessible from trusted IPs

## Next Steps

1. Install dependencies: `npm install`
2. Set up database on VPS
3. Configure environment variables
4. Test signup/login flow
5. Update other pages to use `ProtectedRoute` as needed

