import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';

const router = Router();

// Existing routes
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

// New route for user creation
router.post('/users', UsersController.postNew);

export default router;
