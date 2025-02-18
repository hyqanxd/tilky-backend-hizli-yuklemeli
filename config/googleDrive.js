const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY ? process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID
  },
  scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly']
});

const drive = google.drive({ version: 'v3', auth });

module.exports = drive; 