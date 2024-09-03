import express from 'express';
// Import the bodyParser module for image uploads size tampering
// eslint-disable-next-line import/no-extraneous-dependencies
import bodyParser from 'body-parser';
import router from './routes/index';

const app = express();
const port = parseInt(process.env.PORT, 10) || 5000;

// increase the body size limit to 10MB - or more if you like
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// load routes from the routes folder
app.use(express.json()); // parse incoming requests with JSON payloads (UserController.js)
app.use('/', router);

// start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;
