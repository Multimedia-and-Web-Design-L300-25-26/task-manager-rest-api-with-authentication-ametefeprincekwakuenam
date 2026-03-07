/**
 * tests/setup.js
 *
 * Shared in-memory fake implementations of User and Task models
 * plus a factory that builds a fully wired Express test app.
 * No real MongoDB connection is required to run tests.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// ── In-memory data stores ─────────────────────────────────────────────────────
export const userStore = new Map();
export const taskStore = new Map();

export const clearStores = () => {
  userStore.clear();
  taskStore.clear();
};

// ── Fake User model ───────────────────────────────────────────────────────────
export const UserFake = {
  async findOne({ email }) {
    for (const u of userStore.values()) {
      if (u.email === email) return u;
    }
    return null;
  },
  async findById(id) {
    const u = userStore.get(String(id));
    if (!u) return null;
    const { password, comparePassword, ...rest } = u;
    return rest;
  },
  async create({ name, email, password }) {
    if (!name || !email || !password) {
      const err = new Error('Validation failed');
      err.name = 'ValidationError';
      throw err;
    }
    for (const u of userStore.values()) {
      if (u.email === email) {
        const err = new Error('Duplicate key error');
        err.code = 11000;
        throw err;
      }
    }
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    const _id = new mongoose.Types.ObjectId();
    const user = {
      _id,
      name,
      email,
      password: hashed,
      comparePassword: async (pwd) => bcrypt.compare(pwd, hashed),
    };
    userStore.set(String(_id), user);
    return user;
  },
};

// ── Fake Task model ───────────────────────────────────────────────────────────
export const TaskFake = {
  async find({ user }) {
    const results = [];
    for (const t of taskStore.values()) {
      if (String(t.user) === String(user)) results.push({ ...t });
    }
    return results;
  },
  async findById(id) {
    const t = taskStore.get(String(id));
    if (!t) return null;
    return { ...t, deleteOne: async () => taskStore.delete(String(t._id)) };
  },
  async create({ title, description, completed, user }) {
    if (!title) {
      const err = new Error('Title is required');
      err.name = 'ValidationError';
      throw err;
    }
    const _id = new mongoose.Types.ObjectId();
    const task = { _id, title, description: description || '', completed: completed || false, user };
    taskStore.set(String(_id), task);
    return { ...task };
  },
};

// ── Auth middleware factory ───────────────────────────────────────────────────
export const makeProtect = (User) => async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ message: 'No token provided, authorization denied' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Token is not valid' });
  }
};

export const genToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// ── Build a fully wired Express test app ─────────────────────────────────────
export const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  const protect = makeProtect(UserFake);

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password)
        return res.status(400).json({ message: 'Please provide name, email, and password' });
      const user = await UserFake.create({ name, email, password });
      return res.status(201).json({ _id: user._id, name: user.name, email: user.email, token: genToken(user._id) });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password)
        return res.status(400).json({ message: 'Please provide email and password' });
      const user = await UserFake.findOne({ email });
      if (!user) return res.status(401).json({ message: 'Invalid credentials' });
      const match = await user.comparePassword(password);
      if (!match) return res.status(401).json({ message: 'Invalid credentials' });
      return res.status(200).json({ _id: user._id, name: user.name, email: user.email, token: genToken(user._id) });
    } catch (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  });

  app.post('/api/tasks', protect, async (req, res) => {
    try {
      const { title, description, completed } = req.body;
      if (!title) return res.status(400).json({ message: 'Title is required' });
      const task = await TaskFake.create({ title, description, completed, user: req.user._id });
      return res.status(201).json(task);
    } catch (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  });

  app.get('/api/tasks', protect, async (req, res) => {
    try {
      const tasks = await TaskFake.find({ user: req.user._id });
      return res.status(200).json(tasks);
    } catch (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  });

  app.delete('/api/tasks/:id', protect, async (req, res) => {
    try {
      const task = await TaskFake.findById(req.params.id);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      if (String(task.user) !== String(req.user._id))
        return res.status(403).json({ message: 'Not authorized to delete this task' });
      await task.deleteOne();
      return res.status(200).json({ message: 'Task deleted successfully' });
    } catch (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  });

  return app;
};