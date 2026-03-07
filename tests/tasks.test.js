/**
 * tests/tasks.test.js
 *
 * Tests for protected task endpoints:
 *   POST   /api/tasks
 *   GET    /api/tasks
 *   DELETE /api/tasks/:id
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { buildTestApp, clearStores } from './setup.js';

const app = buildTestApp();

// ── Shared state ──────────────────────────────────────────────────────────────
let tokenUser1;
let tokenUser2;

// Register two users fresh before each test
beforeEach(async () => {
  clearStores();

  const r1 = await request(app).post('/api/auth/register').send({
    name: 'User One',
    email: 'user1@test.com',
    password: 'password1234',
  });
  tokenUser1 = r1.body.token;

  const r2 = await request(app).post('/api/auth/register').send({
    name: 'User Two',
    email: 'user2@test.com',
    password: 'password5678',
  });
  tokenUser2 = r2.body.token;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/tasks', () => {
  it('should create a task for the authenticated user', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({ title: 'My First Task', description: 'Get things done' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body).toHaveProperty('title', 'My First Task');
    expect(res.body).toHaveProperty('user');
  });

  it('should return 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Unauthorized Task' });

    expect(res.statusCode).toBe(401);
  });

  it('should return 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({ description: 'A task without a title' });

    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/tasks', () => {
  it('should return only tasks belonging to the authenticated user', async () => {
    // User 1 creates two tasks
    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({ title: 'Task Alpha' });

    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({ title: 'Task Beta' });

    // User 2 creates one task
    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ title: 'Task Gamma' });

    // User 1 fetches their tasks
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser1}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const titles = res.body.map((t) => t.title);
    expect(titles).toContain('Task Alpha');
    expect(titles).toContain('Task Beta');
    expect(titles).not.toContain('Task Gamma');
  });

  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.statusCode).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/tasks/:id', () => {
  it('should delete a task owned by the authenticated user', async () => {
    const create = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({ title: 'Task to Delete' });

    const res = await request(app)
      .delete(`/api/tasks/${create.body._id}`)
      .set('Authorization', `Bearer ${tokenUser1}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 403 when a different user tries to delete the task', async () => {
    const create = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({ title: 'Protected Task' });

    const res = await request(app)
      .delete(`/api/tasks/${create.body._id}`)
      .set('Authorization', `Bearer ${tokenUser2}`);

    expect(res.statusCode).toBe(403);
  });

  it('should return 404 when the task does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .delete(`/api/tasks/${nonExistentId}`)
      .set('Authorization', `Bearer ${tokenUser1}`);

    expect(res.statusCode).toBe(404);
  });

  it('should return 401 when no token is provided', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();

    const res = await request(app).delete(`/api/tasks/${nonExistentId}`);
    expect(res.statusCode).toBe(401);
  });
});