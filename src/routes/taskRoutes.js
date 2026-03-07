import express from 'express';
import { createTask, getTasks, deleteTask } from '../controllers/taskController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

// All task routes require authentication
router.use(protect);

router.post('/', createTask);
router.get('/', getTasks);
router.delete('/:id', deleteTask);

export default router;