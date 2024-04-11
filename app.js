const { Client } = require('whatsapp-web.js');
const qrcode = require("qrcode-terminal");
require('dotenv').config()
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const app = express();
const port = 8000;

const client_id = `${process.env.CLIENT_ID}`;
const client_secret = `${process.env.CLIENT_SECRET}`;
const redirect_uri = `${process.env.REDIRECT}`;

let refresh_token = null;

const client = new Client({
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  }
});

client.on('qr', (qrc) => {
  const qr = qrcode.generate(qrc, { small: true });
  console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message_create', async msg => {
  if (msg.body == '!ping') {
    await client.setStatus('t');
    await msg.reply('pong');
  }
});

client.initialize();

app.get('/login', (req, res) => {
  const scope = 'user-read-currently-playing';
  res.redirect(`https://accounts.spotify.com/authorize?response_type=code&client_id=${client_id}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirect_uri)}`);
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', qs.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirect_uri,
      client_id: client_id,
      client_secret: client_secret,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    refresh_token = tokenResponse.data.refresh_token;
    res.send('Authentication successful! You can now close this window.');
  } catch (error) {
    console.error('Error:', error.response.data);
    res.status(error.response.status).send('Error during authentication');
  }
});

app.get('/currentTrack', async (req, res) => {
  try {
    if (!refresh_token) {
      throw new Error('No refresh token available');
    }

    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refresh_token,
      client_id: client_id,
      client_secret: client_secret,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const access_token = tokenResponse.data.access_token;

    const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      },
    });

    if (response.data.is_playing) {
      const { artists, album, name } = response.data.item;
      const artistNames = artists.map(artist => artist.name).join(', ');
      const trackInfo = {
        artists: artistNames,
        album: album.name,
        name: name
      };
      await client.setStatus(`Listening to: ${trackInfo.name}        by ${trackInfo.artists}        From the Album: ${trackInfo.album}`);
      res.json(trackInfo);
    } else {
        await client.setStatus("I don't listen to anything...");
    }
  } catch (error) {
    console.error('Error:', error.response.data);
    res.status(error.response.status).send('Error fetching currently playing track');
  }
});

setInterval(async () => {
  try {
    await axios.get('http://localhost:8000/currentTrack');
  } catch (error) {
    console.error('Error fetching current track:', error);
  }
}, 0.5 * 60 * 1000);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
