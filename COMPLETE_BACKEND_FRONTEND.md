# TECH SOLUTIONS HUB - COMPLETE CODEBASE

## BACKEND - Express + TypeScript

### 1. Configuration

```typescript
// backend/src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || '3001'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432'),
  DB_NAME: process.env.DB_NAME || 'tech_hub',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'password',
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
};
```

```typescript
// backend/src/config/database.ts
import { Pool } from 'pg';
import { config } from './env';

export const pool = new Pool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  database: config.DB_NAME,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
});

pool.on('error', (err) => console.error('DB Error:', err));
export const query = (text: string, params?: any[]) => pool.query(text, params);
```

### 2. Type Definitions

```typescript
// backend/src/types/index.ts
export interface User {
  id: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  user_type: 'individual' | 'business' | 'staff' | 'admin';
  created_at: Date;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  base_price: number;
  is_active: boolean;
}

export enum OrderStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface Order {
  id: string;
  user_id: string;
  service_id: string;
  title: string;
  description: string;
  status: OrderStatus;
  price_quote: number;
  created_at: Date;
}

export interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  created_at: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
```

### 3. Middleware

```typescript
// backend/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; user_type: string };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'No token' });
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.user_type !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};
```

```typescript
// backend/src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string, public details?: any) {
    super(message);
  }
}

export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', error);
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ success: false, error: error.message });
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

### 4. Auth Module

```typescript
// backend/src/modules/auth/auth.service.ts
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { query } from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../middleware/error.middleware';

export class AuthService {
  static async register(data: any) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) throw new ApiError(400, 'Email already registered');

    const password_hash = await bcryptjs.hash(data.password, 10);
    const userId = uuid();

    const result = await query(
      `INSERT INTO users (id, email, phone, first_name, last_name, password_hash, user_type, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id, email, first_name, last_name, user_type`,
      [userId, data.email, data.phone, data.first_name, data.last_name, password_hash, data.user_type]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, user_type: user.user_type }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRE });

    return { user, token };
  }

  static async login(email: string, password: string) {
    const result = await query(
      'SELECT id, email, password_hash, first_name, last_name, user_type, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) throw new ApiError(401, 'Invalid credentials');
    const user = result.rows[0];
    if (!user.is_active) throw new ApiError(401, 'Account is inactive');

    const isValid = await bcryptjs.compare(password, user.password_hash);
    if (!isValid) throw new ApiError(401, 'Invalid credentials');

    const token = jwt.sign({ id: user.id, email: user.email, user_type: user.user_type }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRE });

    return {
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, user_type: user.user_type },
      token,
    };
  }
}
```

```typescript
// backend/src/modules/auth/auth.controller.ts
import { Response } from 'express';
import { AuthService } from './auth.service';
import { asyncHandler } from '../../middleware/error.middleware';

export class AuthController {
  static register = asyncHandler(async (req: any, res: Response) => {
    const result = await AuthService.register(req.body);
    res.status(201).json({ success: true, message: 'User registered', data: result });
  });

  static login = asyncHandler(async (req: any, res: Response) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.json({ success: true, message: 'Login successful', data: result });
  });

  static logout = asyncHandler(async (req: any, res: Response) => {
    res.json({ success: true, message: 'Logged out' });
  });
}
```

```typescript
// backend/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { AuthController } from './auth.controller';

const router = Router();
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);

export default router;
```

### 5. Services Module

```typescript
// backend/src/modules/services/service.service.ts
import { v4 as uuid } from 'uuid';
import { query } from '../../config/database';
import { ApiError } from '../../middleware/error.middleware';
import { Service, PaginatedResponse } from '../../types';

export class ServiceService {
  static async getAll(category?: string, page: number = 1, limit: number = 10): Promise<PaginatedResponse<Service>> {
    let sql = 'SELECT * FROM services WHERE is_active = true';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = $1';
      params.push(category);
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM services WHERE is_active = true ${category ? 'AND category = $1' : ''}`,
      category ? [category] : []
    );
    const total = parseInt(countResult.rows[0].count);

    const offset = (page - 1) * limit;
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return {
      data: result.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  static async getById(id: string): Promise<Service> {
    const result = await query('SELECT * FROM services WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new ApiError(404, 'Service not found');
    return result.rows[0];
  }

  static async create(data: any): Promise<Service> {
    const id = uuid();
    const result = await query(
      `INSERT INTO services (id, name, description, category, base_price, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [id, data.name, data.description, data.category, data.base_price]
    );
    return result.rows[0];
  }
}
```

```typescript
// backend/src/modules/services/service.controller.ts
import { Response } from 'express';
import { ServiceService } from './service.service';
import { asyncHandler } from '../../middleware/error.middleware';
import { AuthRequest } from '../../middleware/auth.middleware';

export class ServiceController {
  static getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { category, page = 1, limit = 10 } = req.query;
    const result = await ServiceService.getAll(category as string, parseInt(page as string), parseInt(limit as string));
    res.json({ success: true, data: result });
  });

  static getById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await ServiceService.getById(req.params.id);
    res.json({ success: true, data: result });
  });

  static create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await ServiceService.create(req.body);
    res.status(201).json({ success: true, data: result });
  });
}
```

```typescript
// backend/src/modules/services/service.routes.ts
import { Router } from 'express';
import { ServiceController } from './service.controller';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.middleware';

const router = Router();
router.get('/', ServiceController.getAll);
router.get('/:id', ServiceController.getById);
router.post('/', authMiddleware, adminMiddleware, ServiceController.create);

export default router;
```

### 6. Main App

```typescript
// backend/src/app.ts
import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { errorHandler } from './middleware/error.middleware';

import authRoutes from './modules/auth/auth.routes';
import serviceRoutes from './modules/services/service.routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

const PORT = config.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
```

---

## FRONTEND - Next.js + React

### 1. API Service

```typescript
// frontend/src/lib/api.ts
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

### 2. State Management

```typescript
// frontend/src/store/auth.ts
import { create } from 'zustand';
import { User } from '../types';

interface AuthStore {
  user: User | null;
  token: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  logout: () => set({ user: null, token: null }),
}));
```

### 3. Homepage

```typescript
// frontend/src/pages/index.tsx
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">TechHub</h1>
          <div className="space-x-4">
            <Link href="/auth/login" className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded">
              Login
            </Link>
            <Link href="/auth/register" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Register
            </Link>
          </div>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-4xl font-bold text-gray-900 mb-4">Your One-Stop Digital Solutions Hub</h2>
        <p className="text-xl text-gray-600 mb-8">Printing • Design • IT Support • Web Development • Training</p>
        <button
          onClick={() => router.push('/services')}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-lg font-semibold"
        >
          Explore Services
        </button>
      </section>
    </div>
  );
}
```

### 4. Login Page

```typescript
// frontend/src/pages/auth/login.tsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setToken } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, token } = response.data.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      setUser(user);
      setToken(token);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Login</h2>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="text-center text-gray-600 mt-4">
          Don't have an account?{' '}
          <Link href="/auth/register" className="text-blue-600 hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
```

### 5. Dashboard

```typescript
// frontend/src/pages/dashboard.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Order } from '@/types';

export default function Dashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }

    const fetchOrders = async () => {
      try {
        const response = await api.get('/orders/my-orders');
        setOrders(response.data.data.data);
      } catch (error) {
        console.error('Failed to fetch orders', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user, router]);

  const handleLogout = () => {
    logout();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">TechHub</h1>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">Welcome, {user?.first_name}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">My Dashboard</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <Link
            href="/services"
            className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 text-center font-semibold"
          >
            Request Service
          </Link>
          <div className="bg-green-600 text-white p-6 rounded-lg text-center font-semibold">
            Total Orders: {orders.length}
          </div>
          <div className="bg-purple-600 text-white p-6 rounded-lg text-center font-semibold">
            Active Orders: {orders.filter(o => o.status === 'in_progress').length}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Recent Orders</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Order ID</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Title</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Price</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{order.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{order.title}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">Ksh {order.price_quote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## DATABASE SCHEMA

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  password_hash VARCHAR(255),
  user_type VARCHAR(50) DEFAULT 'individual',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  base_price DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  service_id UUID REFERENCES services(id),
  title VARCHAR(255),
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  price_quote DECIMAL(10, 2),
  price_final DECIMAL(10, 2),
  delivery_date TIMESTAMP,
  assigned_to UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  amount DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'KES',
  method VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  transaction_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## SETUP INSTRUCTIONS

1. Install dependencies
2. Configure .env files
3. Create PostgreSQL database
4. Run schema.sql
5. Start backend: npm run dev
6. Start frontend: npm run dev
