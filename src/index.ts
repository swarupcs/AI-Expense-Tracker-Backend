import express from 'express';

const app = express();
const PORT = 8080;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('TypeScript Express Server Running 🚀');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
