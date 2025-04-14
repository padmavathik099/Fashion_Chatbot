const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/proxy', async (req, res) => {
    try {
        const response = await axios.post('https://ecbb2b2d47f33f3242.gradio.live/', req.body);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Error forwarding request' });
    }
});

app.listen(5000, () => console.log('Proxy server running on port 5000'));
