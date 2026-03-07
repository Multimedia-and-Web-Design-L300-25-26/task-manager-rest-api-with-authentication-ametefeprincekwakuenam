import request from 'supertest';
import { buildTestApp, clearStores } from './setup.js';

const app = buildTestApp();

beforeEach(() => clearStores());

describe('POST /api/auth/register', () => {
  it('should register a new user and return user data without the password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body).toHaveProperty('name', 'Alice');
    expect(res.body).toHaveProperty('email', 'alice@example.com');
    expect(res.body).toHaveProperty('token');
    expect(res.body).not.toHaveProperty('password');
  });

  it('should not register a user with a duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'dup@example.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice Copy',
      email: 'dup@example.com',
      password: 'password456',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'incomplete@example.com' });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'securepass',
    });
  });

  it('should login with valid credentials and return a JWT token', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'securepass',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('email', 'bob@example.com');
    expect(res.body).not.toHaveProperty('password');
  });

  it('should return 401 for an incorrect password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'wrongpassword',
    });

    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for a non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'securepass',
    });

    expect(res.statusCode).toBe(401);
  });
});