import express from 'express';
import bodyParser from 'body-parser';
import router from './routes/index';

const app = express();
const port = parseInt(process.env.PORT, 10) || 5000;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use(express.json());
app.use('/', router);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;
