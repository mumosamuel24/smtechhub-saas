import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// Mock user for demonstration
const mockUsers = [
  {
    id: 'user_1',
    email: 'admin@smtechhub.co.ke',
    password: '$2a$10$YIjlrHWIVz8Rz8Y8Z8Y8Z8Y8Z8Y8Z8Y8Z8Y8Z8Y', // hashed 'admin123'
    name: 'Admin User',
    role: 'ADMIN',
    organizationId: 'org_1',
  },
];

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 400,
        error: 'Bad Request',
        message: 'Email and password required',
      });
    }

    // Find user (replace with database query)
    const user = mockUsers.find(u => u.email === email);
    
    if (!user) {
      return res.status(401).json({
        status: 401,
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({
        status: 401,
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    res.json({
      status: 200,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Failed to login',
    });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, name, password, phone } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({
        status: 400,
        error: 'Bad Request',
        message: 'Email, name, and password required',
      });
    }

    // Check if user exists (replace with database query)
    const existingUser = mockUsers.find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({
        status: 409,
        error: 'Conflict',
        message: 'Email already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (replace with database operation)
    const newUser = {
      id: `user_${Date.now()}`,
      email,
      name,
      password: hashedPassword,
      phone,
      role: 'STAFF',
      organizationId: `org_${Date.now()}`,
    };

    // Generate JWT
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        organizationId: newUser.organizationId,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    res.status(201).json({
      status: 201,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Failed to register',
    });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.json({
    status: 200,
    message: 'Logged out successfully',
  });
});

export default router;
